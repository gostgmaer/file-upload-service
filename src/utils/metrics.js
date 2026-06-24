const promClient = require('prom-client');

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// Express's req.route.path isn't populated until routing completes, and only
// reflects the matched router pattern (e.g. "/:id/download"), not raw
// high-cardinality paths/ids - safe to use as a metric label.
function httpMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
    httpRequestCounter.labels(req.method, route, String(res.statusCode)).inc();
    httpRequestDuration.labels(req.method, route, String(res.statusCode)).observe(durationSeconds);
  });
  next();
}

module.exports = { register, httpMetricsMiddleware };
