'use strict';

// mock-prefixed variables can be safely referenced inside jest.mock() factory
// even though jest hoists that call above the declarations.
const mockBulkDelete         = jest.fn();
const mockBulkUpdateMetadata = jest.fn();
const mockBulkGetSignedUrls  = jest.fn();

jest.mock('../src/services/FileService', () =>
  jest.fn().mockImplementation(() => ({
    uploadFile:          jest.fn(),
    getFiles:            jest.fn(),
    getFileById:         jest.fn(),
    deleteFile:          jest.fn(),
    renameFile:          jest.fn(),
    updateFileMetadata:  jest.fn(),
    replaceFileContent:  jest.fn(),
    getFileTransactions: jest.fn(),
    bulkDelete:          mockBulkDelete,
    bulkUpdateMetadata:  mockBulkUpdateMetadata,
    bulkGetSignedUrls:   mockBulkGetSignedUrls,
  }))
);

const request = require('supertest');
const app     = require('../app');

const HEADERS = { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' };

beforeEach(() => jest.clearAllMocks());

const makeFileDoc = (overrides = {}) => ({
  _id: 'id1', tenantId: 'tenant-1', originalName: 'file.pdf',
  storageKey: 'files/t/u/key.pdf', size: 1024, mimeType: 'application/pdf',
  extension: '.pdf', uploader: 'user-1', category: '', status: 'active',
  publicUrl: '/files/t/u/key.pdf',
  metadata: {
    description: '', tags: [], custom: {}, title: '', altText: '',
    author: '', source: '', language: '', expiresAt: null, isPublic: false, linkedTo: {},
  },
  versions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  ...overrides,
});

// ── POST /api/files/bulk/delete ───────────────────────────────────────────────
describe('POST /api/files/bulk/delete', () => {
  it('returns 400 when ids is missing', async () => {
    const res = await request(app).post('/api/files/bulk/delete').set(HEADERS).send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when ids array is empty', async () => {
    const res = await request(app).post('/api/files/bulk/delete').set(HEADERS).send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when more than 100 ids are provided', async () => {
    const res = await request(app)
      .post('/api/files/bulk/delete')
      .set(HEADERS)
      .send({ ids: Array(101).fill('507f1f77bcf86cd799439011') });
    expect(res.status).toBe(400);
  });

  it('deletes files and returns succeeded/failed breakdown', async () => {
    mockBulkDelete.mockResolvedValue({ succeeded: ['id1', 'id2'], failed: [] });

    const res = await request(app)
      .post('/api/files/bulk/delete')
      .set(HEADERS)
      .send({ ids: ['id1', 'id2'] });

    expect(res.status).toBe(200);
    expect(res.body.data.succeeded).toEqual(['id1', 'id2']);
    expect(res.body.data.failed).toHaveLength(0);
    expect(res.body.data).toHaveProperty('requestId');
  });

  it('reports partial failures without a 5xx response', async () => {
    mockBulkDelete.mockResolvedValue({
      succeeded: ['id1'],
      failed:    [{ id: 'id2', reason: 'File not found' }],
    });

    const res = await request(app)
      .post('/api/files/bulk/delete')
      .set(HEADERS)
      .send({ ids: ['id1', 'id2'] });

    expect(res.status).toBe(200);
    expect(res.body.data.succeeded).toHaveLength(1);
    expect(res.body.data.failed).toHaveLength(1);
    expect(res.body.data.failed[0]).toMatchObject({ id: 'id2', reason: 'File not found' });
  });
});

// ── POST /api/files/bulk/permanent-delete ────────────────────────────────────
describe('POST /api/files/bulk/permanent-delete', () => {
  it('calls bulkDelete with permanent=true', async () => {
    mockBulkDelete.mockResolvedValue({ succeeded: ['id1'], failed: [] });

    const res = await request(app)
      .post('/api/files/bulk/permanent-delete')
      .set(HEADERS)
      .send({ ids: ['id1'] });

    expect(res.status).toBe(200);
    expect(mockBulkDelete).toHaveBeenCalledWith(
      ['id1'], 'user-1', 'tenant-1', expect.any(String), true
    );
  });
});

// ── PATCH /api/files/bulk/metadata ───────────────────────────────────────────
describe('PATCH /api/files/bulk/metadata', () => {
  it('returns 400 when updates field is missing', async () => {
    const res = await request(app)
      .patch('/api/files/bulk/metadata')
      .set(HEADERS)
      .send({ ids: ['id1'] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when updates object is empty', async () => {
    const res = await request(app)
      .patch('/api/files/bulk/metadata')
      .set(HEADERS)
      .send({ ids: ['id1'], updates: {} });
    expect(res.status).toBe(400);
  });

  it('applies metadata patch to multiple files', async () => {
    mockBulkUpdateMetadata.mockResolvedValue({
      succeeded: [{ id: 'id1', file: makeFileDoc({ category: 'docs' }) }],
      failed:    [],
    });

    const res = await request(app)
      .patch('/api/files/bulk/metadata')
      .set(HEADERS)
      .send({ ids: ['id1'], updates: { category: 'docs' } });

    expect(res.status).toBe(200);
    expect(res.body.data.succeeded).toHaveLength(1);
    // formatFile is applied — response has normalised shape
    expect(res.body.data.succeeded[0].file).toHaveProperty('id');
    expect(res.body.data.succeeded[0].file).toHaveProperty('metadata');
  });

  it('passes both ids and updates to the service', async () => {
    mockBulkUpdateMetadata.mockResolvedValue({ succeeded: [], failed: [] });

    await request(app)
      .patch('/api/files/bulk/metadata')
      .set(HEADERS)
      .send({ ids: ['id1', 'id2'], updates: { metadata: { isPublic: true } } });

    expect(mockBulkUpdateMetadata).toHaveBeenCalledWith(
      ['id1', 'id2'], 'user-1', 'tenant-1',
      { metadata: { isPublic: true } },
      expect.any(String)
    );
  });
});

// ── POST /api/files/bulk/signed-urls ─────────────────────────────────────────
describe('POST /api/files/bulk/signed-urls', () => {
  it('returns 400 when ids is missing', async () => {
    const res = await request(app).post('/api/files/bulk/signed-urls').set(HEADERS).send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when expiry is below minimum (60s)', async () => {
    const res = await request(app)
      .post('/api/files/bulk/signed-urls')
      .set(HEADERS)
      .send({ ids: ['id1'], expiry: 30 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when expiry exceeds maximum (7 days)', async () => {
    const res = await request(app)
      .post('/api/files/bulk/signed-urls')
      .set(HEADERS)
      .send({ ids: ['id1'], expiry: 700000 });
    expect(res.status).toBe(400);
  });

  it('generates signed URLs for multiple files', async () => {
    mockBulkGetSignedUrls.mockResolvedValue({
      succeeded: [{
        id: 'id1', originalName: 'file.pdf',
        mimeType: 'application/pdf', size: 1024,
        signedUrl: 'https://storage.example.com/file.pdf?token=abc123',
      }],
      failed: [],
    });

    const res = await request(app)
      .post('/api/files/bulk/signed-urls')
      .set(HEADERS)
      .send({ ids: ['id1'], expiry: 3600 });

    expect(res.status).toBe(200);
    expect(res.body.data.succeeded).toHaveLength(1);
    expect(res.body.data.succeeded[0]).toHaveProperty('signedUrl');
    expect(res.body.data.succeeded[0]).toHaveProperty('originalName');
    expect(mockBulkGetSignedUrls).toHaveBeenCalledWith(['id1'], 'tenant-1', { expiry: 3600 });
  });

  it('works without optional expiry parameter', async () => {
    mockBulkGetSignedUrls.mockResolvedValue({ succeeded: [], failed: [] });

    const res = await request(app)
      .post('/api/files/bulk/signed-urls')
      .set(HEADERS)
      .send({ ids: ['id1'] });

    expect(res.status).toBe(200);
    expect(mockBulkGetSignedUrls).toHaveBeenCalledWith(['id1'], 'tenant-1', {});
  });
});
