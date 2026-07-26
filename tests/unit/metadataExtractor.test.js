const request = require('supertest');
const mongoose = require('mongoose');
const FileMetadata = require('../../src/models/FileMetadata');
const MetadataExtractor = require('../../src/utils/MetadataExtractor');

describe('Metadata Extractor & FileMetadata Model Unit Tests', () => {
  test('should extract hashes, format, character & line count from text file', async () => {
    const textBuffer = Buffer.from('Hello World!\nSecond Line of text.');
    const meta = await MetadataExtractor.extract(textBuffer, 'text/plain', 'test.txt');

    expect(meta.hash.md5).toBeDefined();
    expect(meta.hash.sha256).toBeDefined();
    expect(meta.format).toBe('txt');
    expect(meta.characterCount).toBe(33);
    expect(meta.wordCount).toBe(6);
    expect(meta.lineCount).toBe(2);
    expect(meta.encoding).toBe('utf8');
  });

  test('should extract MD5 & SHA256 hashes for binary files', async () => {
    const binBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const meta = await MetadataExtractor.extract(binBuffer, 'application/octet-stream', 'file.bin');

    expect(meta.hash.md5).toHaveLength(32);
    expect(meta.hash.sha256).toHaveLength(64);
  });
});
