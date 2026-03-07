'use strict';

// Module-level mock functions — the `mock` prefix allows jest's hoisting to
// make these available inside the jest.mock() factory even though they look
// like they're declared after the jest.mock() call.
const mockUploadFile         = jest.fn();
const mockGetFiles           = jest.fn();
const mockGetFileById        = jest.fn();
const mockDeleteFile         = jest.fn();
const mockRenameFile         = jest.fn();
const mockUpdateFileMetadata = jest.fn();
const mockReplaceFileContent = jest.fn();
const mockGetFileTransactions = jest.fn();
const mockBulkDelete         = jest.fn();
const mockBulkUpdateMetadata = jest.fn();
const mockBulkGetSignedUrls  = jest.fn();

jest.mock('../src/services/FileService', () =>
  jest.fn().mockImplementation(() => ({
    uploadFile:           mockUploadFile,
    getFiles:             mockGetFiles,
    getFileById:          mockGetFileById,
    downloadFile:         jest.fn(),
    renameFile:           mockRenameFile,
    updateFileMetadata:   mockUpdateFileMetadata,
    replaceFileContent:   mockReplaceFileContent,
    deleteFile:           mockDeleteFile,
    getFileTransactions:  mockGetFileTransactions,
    bulkDelete:           mockBulkDelete,
    bulkUpdateMetadata:   mockBulkUpdateMetadata,
    bulkGetSignedUrls:    mockBulkGetSignedUrls,
  }))
);

const request = require('supertest');
const app     = require('../app');

const HEADERS = { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' };

beforeEach(() => jest.clearAllMocks());

// ── Helpers ──────────────────────────────────────────────────────────────────
const makeFileDoc = (overrides = {}) => ({
  _id:         '507f1f77bcf86cd799439011',
  tenantId:    'tenant-1',
  originalName:'document.pdf',
  storageKey:  'files/tenant-1/user-1/ts-uuid-document.pdf',
  size:        2048,
  mimeType:    'application/pdf',
  extension:   '.pdf',
  uploader:    'user-1',
  category:    '',
  status:      'active',
  publicUrl:   '/files/tenant-1/user-1/ts-uuid-document.pdf',
  metadata: {
    description: '', tags: [], custom: {}, title: '',
    altText: '', author: '', source: '', language: '',
    expiresAt: null, isPublic: false, linkedTo: {},
  },
  versions:  [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// ── Upload ────────────────────────────────────────────────────────────────────
describe('POST /api/files/upload', () => {
  it('returns 400 when no files are attached', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .set(HEADERS);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a disallowed MIME type with 415', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .set(HEADERS)
      .attach('files', Buffer.from('MZ binary'), {
        filename:    'malware.exe',
        contentType: 'application/x-msdownload',
      });
    expect(res.status).toBe(415);
  });

  it('uploads a valid PDF and returns normalised file shape', async () => {
    mockUploadFile.mockResolvedValue(makeFileDoc());

    const res = await request(app)
      .post('/api/files/upload')
      .set(HEADERS)
      .attach('files', Buffer.from('%PDF-1.4 test content'), {
        filename:    'document.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const item = res.body.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('originalName', 'document.pdf');
    expect(item).toHaveProperty('mimeType', 'application/pdf');
    expect(item).toHaveProperty('url');
    expect(item).toHaveProperty('metadata');
    expect(item.metadata).toHaveProperty('isPublic', false);
    expect(item).toHaveProperty('versions');
    expect(item).toHaveProperty('createdAt');
  });

  it('calls uploadFile once per attached file', async () => {
    mockUploadFile.mockResolvedValue(makeFileDoc());

    await request(app)
      .post('/api/files/upload')
      .set(HEADERS)
      .attach('files', Buffer.from('%PDF-1.4 a'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .attach('files', Buffer.from('%PDF-1.4 b'), { filename: 'b.pdf', contentType: 'application/pdf' });

    expect(mockUploadFile).toHaveBeenCalledTimes(2);
  });
});

// ── List ──────────────────────────────────────────────────────────────────────
describe('GET /api/files', () => {
  it('returns paginated file list', async () => {
    mockGetFiles.mockResolvedValue({
      files:      [makeFileDoc()],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    });

    const res = await request(app).get('/api/files').set(HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('files');
    expect(res.body.data).toHaveProperty('pagination');
    expect(res.body.data.pagination.total).toBe(1);
  });

  it('returns 400 for an invalid sort field', async () => {
    const res = await request(app).get('/api/files?sort=badfield').set(HEADERS);
    expect(res.status).toBe(400);
  });

  it('returns 400 when page is below 1', async () => {
    const res = await request(app).get('/api/files?page=0').set(HEADERS);
    expect(res.status).toBe(400);
  });
});

// ── Get by ID ─────────────────────────────────────────────────────────────────
describe('GET /api/files/:id', () => {
  it('returns 404 when the file does not exist', async () => {
    mockGetFileById.mockRejectedValue(
      Object.assign(new Error('File not found'), { statusCode: 404, isOperational: true })
    );

    const res = await request(app)
      .get('/api/files/507f1f77bcf86cd799439011')
      .set(HEADERS);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns a normalised file object on success', async () => {
    mockGetFileById.mockResolvedValue(makeFileDoc());

    const res = await request(app)
      .get('/api/files/507f1f77bcf86cd799439011')
      .set(HEADERS);

    expect(res.status).toBe(200);
    const file = res.body.data;
    expect(file).toHaveProperty('id');
    expect(file).toHaveProperty('tenantId', 'tenant-1');
    expect(file).toHaveProperty('storageKey');
    expect(file).toHaveProperty('metadata');
    expect(file).toHaveProperty('versions');
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────
describe('DELETE /api/files/:id', () => {
  it('soft-deletes a file', async () => {
    mockDeleteFile.mockResolvedValue(makeFileDoc({ status: 'deleted' }));

    const res = await request(app)
      .delete('/api/files/507f1f77bcf86cd799439011')
      .set(HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDeleteFile).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011', 'user-1', 'tenant-1', expect.any(String), false
    );
  });

  it('permanently deletes a file', async () => {
    mockDeleteFile.mockResolvedValue({ message: 'File permanently deleted' });

    const res = await request(app)
      .delete('/api/files/507f1f77bcf86cd799439011/permanent')
      .set(HEADERS);

    expect(res.status).toBe(200);
    expect(mockDeleteFile).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011', 'user-1', 'tenant-1', expect.any(String), true
    );
  });
});

// ── Update metadata ───────────────────────────────────────────────────────────
describe('PATCH /api/files/:id', () => {
  it('returns 400 when body is empty', async () => {
    const res = await request(app)
      .patch('/api/files/507f1f77bcf86cd799439011')
      .set(HEADERS)
      .send({});
    expect(res.status).toBe(400);
  });

  it('updates file metadata and returns file', async () => {
    mockUpdateFileMetadata.mockResolvedValue(makeFileDoc({ category: 'invoices' }));

    const res = await request(app)
      .patch('/api/files/507f1f77bcf86cd799439011')
      .set(HEADERS)
      .send({ category: 'invoices' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockUpdateFileMetadata).toHaveBeenCalledTimes(1);
  });
});

// ── Rename ────────────────────────────────────────────────────────────────────
describe('PATCH /api/files/:id/rename', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .patch('/api/files/507f1f77bcf86cd799439011/rename')
      .set(HEADERS)
      .send({});
    expect(res.status).toBe(400);
  });

  it('renames a file', async () => {
    mockRenameFile.mockResolvedValue(makeFileDoc({ originalName: 'renamed.pdf' }));

    const res = await request(app)
      .patch('/api/files/507f1f77bcf86cd799439011/rename')
      .set(HEADERS)
      .send({ name: 'renamed.pdf' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
