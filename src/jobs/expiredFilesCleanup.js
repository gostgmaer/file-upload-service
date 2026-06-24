const FileService = require('../services/FileService');

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // hourly
const INITIAL_DELAY_MS = 10_000;

/**
 * Periodically permanently deletes files whose metadata.expiresAt has
 * passed. Returns a stop() function for graceful shutdown.
 */
function startExpiredFilesCleanupJob(intervalMs = DEFAULT_INTERVAL_MS) {
  const fileService = new FileService();

  const run = async () => {
    try {
      const result = await fileService.cleanupExpiredFiles();
      if (result.scanned > 0) {
        console.log(
          `[ExpiredFilesCleanup] scanned=${result.scanned} deleted=${result.deleted} failed=${result.failed}`
        );
      }
    } catch (err) {
      console.error(`[ExpiredFilesCleanup] run failed: ${err.message}`);
    }
  };

  const initialTimer = setTimeout(run, INITIAL_DELAY_MS);
  const interval = setInterval(run, intervalMs);

  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
}

module.exports = { startExpiredFilesCleanupJob };
