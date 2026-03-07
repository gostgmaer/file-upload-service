require('dotenv').config();
const cluster = require('cluster');
const os = require('os');
const { validateEnv } = require('./src/config/validateEnv');
const { connectDB, disconnectDB } = require('./src/config/db');
const { server: serverConfig, scaling } = require('./src/config');
const app = require('./app');

// Validate environment variables at startup — exits with clear error if misconfigured
validateEnv();

// ─── Cluster mode ─────────────────────────────────────────────────────────────
// CLUSTER_WORKERS=0  → auto (one worker per logical CPU core)
// CLUSTER_WORKERS=1  → single process / no clustering (default)
// CLUSTER_WORKERS=N  → exactly N worker processes
const numCPUs = os.cpus().length;
const requestedWorkers = scaling.clusterWorkers;
const workerCount = requestedWorkers === 0 ? numCPUs : requestedWorkers;

if (cluster.isPrimary && workerCount > 1) {
  console.log(`Primary ${process.pid} is running — forking ${workerCount} worker(s) [CLUSTER_WORKERS=${requestedWorkers || 'auto'}]`);

  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`Worker ${worker.process.pid} exited (code=${code}, signal=${signal}) — restarting`);
    cluster.fork();
  });

  return; // primary process does not run the HTTP server
}

// ─── Worker / single-process logic ────────────────────────────────────────────
let httpServer;

const start = async () => {
  try {
    await connectDB();
    httpServer = app.listen(serverConfig.port, () => {
      const workerLabel = workerCount > 1 ? ` [worker ${process.pid}]` : '';
      console.log(`File upload service running on port ${serverConfig.port} [${serverConfig.env}]${workerLabel}`);
    });

    // Per-request timeout — prevents slow clients from holding connections indefinitely
    if (scaling.requestTimeoutMs > 0) {
      httpServer.timeout = scaling.requestTimeoutMs;
    }
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  console.log(`${signal} received — shutting down gracefully`);
  if (httpServer) {
    // Stop accepting new connections; wait for in-flight requests to finish
    httpServer.close(async () => {
      await disconnectDB();
      console.log('Server closed');
      process.exit(0);
    });

    // Force-exit if graceful shutdown takes too long
    setTimeout(() => {
      console.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch unhandled promise rejections (log + keep process alive in prod)
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// Catch programming errors — log then exit so the process manager restarts cleanly
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

start();
