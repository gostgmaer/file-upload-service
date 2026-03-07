'use strict';

const request = require('supertest');
const app     = require('../app');

describe('GET /health', () => {
  it('returns correct response shape', async () => {
    const res = await request(app).get('/health');
    // DB is not connected in test env — 503 is expected; shape must still be correct
    expect([200, 503]).toContain(res.status);
    expect(res.body).toMatchObject({
      service: 'file-upload-service',
      uptime:  expect.any(Number),
      db:      expect.any(String),
      memory: {
        heapUsedMB:  expect.any(Number),
        heapTotalMB: expect.any(Number),
        rssMB:       expect.any(Number),
      },
    });
  });

  it('includes version string', async () => {
    const res = await request(app).get('/health');
    expect(typeof res.body.version).toBe('string');
  });
});

describe('Unknown routes', () => {
  it('returns 404 with success:false for unlisted paths', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for unknown /api paths', async () => {
    const res = await request(app).get('/api/unknown-resource');
    expect(res.status).toBe(404);
  });
});
