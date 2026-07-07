import { FileUploadClient, FileUploadError } from '../src/client.js';

describe('FileUploadClient', () => {
  let client: FileUploadClient;
  const mockBaseUrl = 'http://localhost:4001';
  const mockSecret = 'super-gateway-secret';

  beforeEach(() => {
    client = new FileUploadClient({
      baseUrl: mockBaseUrl,
      tenantId: 'test-tenant',
      gatewaySecret: mockSecret,
      userId: 'test-user',
      userRole: 'user',
      userEmail: 'test@example.com',
      userName: 'Test User',
    });

    // Mock global fetch
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('constructor defaults to environment variables', () => {
    process.env.FILE_SERVICE_URL = 'https://prod-files.example.com';
    process.env.FILE_SERVICE_TENANT_ID = 'env-tenant';
    process.env.FILE_SERVICE_HMAC_SECRET = 'env-secret';
    process.env.FILE_SERVICE_USER_ID = 'env-user';
    process.env.FILE_SERVICE_USER_ROLE = 'admin';

    const envClient = new FileUploadClient();
    
    // Test internal config via prototype/methods or verify request behavior
    expect((envClient as any).config.baseUrl).toBe('https://prod-files.example.com');
    expect((envClient as any).config.tenantId).toBe('env-tenant');
    expect((envClient as any).config.gatewaySecret).toBe('env-secret');
    expect((envClient as any).config.userId).toBe('env-user');
    expect((envClient as any).config.userRole).toBe('admin');

    // Clean up env
    delete process.env.FILE_SERVICE_URL;
    delete process.env.FILE_SERVICE_TENANT_ID;
    delete process.env.FILE_SERVICE_HMAC_SECRET;
    delete process.env.FILE_SERVICE_USER_ID;
    delete process.env.FILE_SERVICE_USER_ROLE;
  });

  test('asUser clones the client with custom context', async () => {
    const userClient = client.asUser({
      userId: 'other-user',
      userRole: 'admin',
      userEmail: 'other@example.com',
      tenantId: 'other-tenant',
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true, data: { status: 'ok' } }),
    });

    await userClient.listFiles();

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const headers = fetchCall[1].headers as Headers;

    expect(headers.get('X-Tenant-Id')).toBe('other-tenant');
    expect(headers.get('X-User-Id')).toBe('other-user');
    expect(headers.get('X-User-Role')).toBe('admin');
    expect(headers.get('X-User-Email')).toBe('other@example.com');
  });

  test('getHealth calls the health endpoint with skipAuth', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ status: 'ok', db: 'connected' }),
    });

    const health = await client.getHealth();

    expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/health`, expect.objectContaining({
      method: 'GET',
    }));
    expect(health).toEqual({ status: 'ok', db: 'connected' });
  });

  test('builds correct security headers with HMAC signature', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true, data: [] }),
    });

    await client.listFiles();

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const headers = fetchCall[1].headers as Headers;

    expect(headers.get('X-Tenant-Id')).toBe('test-tenant');
    expect(headers.get('X-User-Id')).toBe('test-user');
    expect(headers.get('X-User-Role')).toBe('user');
    expect(headers.get('X-User-Email')).toBe('test@example.com');
    expect(headers.get('X-User-Name')).toBe('Test User');
    
    // Verify HMAC signature calculation:
    // payload: 'test-user:test@example.com:user'
    // secret: 'super-gateway-secret'
    const crypto = require('node:crypto');
    const expectedHmac = crypto
      .createHmac('sha256', mockSecret)
      .update('test-user:test@example.com:user')
      .digest('hex');

    expect(headers.get('X-Gateway-HMAC')).toBe(expectedHmac);
  });

  test('listFiles maps query params correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true, data: { files: [] } }),
    });

    const date = new Date('2026-04-10T12:00:00Z');
    await client.listFiles({
      search: 'invoice',
      limit: 10,
      tags: ['tag1', 'tag2'],
      dateFrom: date,
    });

    const expectedQuery = `?search=invoice&limit=10&tags=tag1&tags=tag2&dateFrom=${encodeURIComponent(date.toISOString())}`;
    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/api/files${expectedQuery}`,
      expect.any(Object)
    );
  });

  test('handles structured API error responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({
        success: false,
        message: 'Invalid Joi validation',
        error: {
          code: 'VALIDATION_ERROR',
          errors: [{ field: 'category', message: 'Category too long' }],
        },
      }),
    });

    await expect(client.getFileMetadata('file-123')).rejects.toThrow(
      new FileUploadError('Invalid Joi validation', 400, 'VALIDATION_ERROR')
    );

    try {
      await client.getFileMetadata('file-123');
    } catch (err: any) {
      expect(err).toBeInstanceOf(FileUploadError);
      expect(err.statusCode).toBe(400);
      expect(err.errorCode).toBe('VALIDATION_ERROR');
      expect(err.details).toEqual([{ field: 'category', message: 'Category too long' }]);
    }
  });

  test('uploadFiles handles Buffer upload and serialization', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true, data: [] }),
    });

    const buffer = Buffer.from('hello world');
    await client.uploadFiles(
      [{ file: buffer, filename: 'hello.txt', contentType: 'text/plain' }],
      {
        category: 'documents',
        tags: ['test', 'upload'],
        custom: { key: 'value' },
        isPublic: true,
      }
    );

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const url = fetchCall[0];
    const options = fetchCall[1];

    expect(url).toBe(`${mockBaseUrl}/api/files/upload`);
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);

    const formData = options.body as FormData;
    expect(formData.get('category')).toBe('documents');
    expect(formData.get('isPublic')).toBe('true');
    expect(formData.get('custom')).toBe(JSON.stringify({ key: 'value' }));
    
    // tags append multiple entries
    expect(formData.getAll('tags')).toEqual(['test', 'upload']);
  });

  test('requestPresignedUpload handles JSON body options', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await client.requestPresignedUpload({
      filename: 'video.mp4',
      contentType: 'video/mp4',
      size: 500000000,
      expiresIn: 3600,
      category: 'videos',
      custom: { quality: '1080p' },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/api/files/upload/presign`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          filename: 'video.mp4',
          contentType: 'video/mp4',
          size: 500000000,
          expiresIn: 3600,
          category: 'videos',
          custom: { quality: '1080p' },
        }),
      })
    );
  });
});
