const net = require('net');

const DEFAULT_TIMEOUT_MS = 30_000;
const CHUNK_SIZE = 64 * 1024;

/**
 * Scans a buffer against a ClamAV daemon using the INSTREAM protocol.
 * Throws if the daemon is unreachable, times out, or replies with anything
 * unrecognized - never resolves "clean" on a failure to actually scan.
 */
function scanBuffer(buffer, { host, port, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = Buffer.alloc(0);
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.end();
      resolve(result);
    };

    socket.setTimeout(timeoutMs, () => fail(new Error('ClamAV scan timed out')));
    socket.on('error', fail);

    socket.on('connect', () => {
      socket.write('zINSTREAM\0');

      let offset = 0;
      while (offset < buffer.length) {
        const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
        const sizeHeader = Buffer.alloc(4);
        sizeHeader.writeUInt32BE(chunk.length, 0);
        socket.write(sizeHeader);
        socket.write(chunk);
        offset += chunk.length;
      }
      // Zero-length chunk signals end of stream
      const endMarker = Buffer.alloc(4);
      endMarker.writeUInt32BE(0, 0);
      socket.write(endMarker);
    });

    socket.on('data', (data) => {
      response = Buffer.concat([response, data]);
    });

    socket.on('end', () => {
      const text = response.toString('utf8').replace(/\0/g, '').trim();
      if (/FOUND$/.test(text)) {
        return finish({ clean: false, signature: text });
      }
      if (/OK$/.test(text)) {
        return finish({ clean: true, signature: null });
      }
      fail(new Error(`Unexpected ClamAV response: ${text || '(empty)'}`));
    });
  });
}

module.exports = { scanBuffer };
