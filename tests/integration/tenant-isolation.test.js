/**
 * Tenant Isolation Integration Tests
 * 
 * CRITICAL: These tests verify that tenant isolation works correctly at the database level.
 * Without proper isolation, data leaks between tenants could occur.
 * 
 * These tests use REAL MongoDB (not mocks) to ensure queries enforce tenantId filtering.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const File = require('../../src/models/File');
const crypto = require('crypto');

// Helper to generate HMAC signature for requests
function generateHmac(userId, email, role) {
  const secret = process.env.GATEWAY_INTERNAL_SECRET || 'test-secret-for-integration-tests';
  const hmacPayload = `${userId}:${email}:${role}`;
  return crypto.createHmac('sha256', secret).update(hmacPayload).digest('hex');
}

// Helper to create authenticated request headers
function createAuthHeaders(tenantId, userId, userRole = 'user', email = null) {
  const userEmail = email || `${userId}@test.com`;
  return {
    'X-Tenant-Id': tenantId,
    'X-User-Id': userId,
    'X-User-Email': userEmail,
    'X-User-Role': userRole,
    'X-Gateway-HMAC': generateHmac(userId, userEmail, userRole),
  };
}

describe('Tenant Isolation Integration Tests', () => {
  const TENANT_A = 'tenant-a';
  const TENANT_B = 'tenant-b';
  const USER_A = 'user-a-123';
  const USER_B = 'user-b-456';

  beforeAll(async () => {
    // Ensure test database connection
    if (mongoose.connection.readyState === 0) {
      const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/file_service_test';
      await mongoose.connect(dbUri);
    }
  });

  beforeEach(async () => {
    // Clean database before each test
    await File.deleteMany({});
  });

  afterAll(async () => {
    // Clean up and close connection
    await File.deleteMany({});
    await mongoose.connection.close();
  });

  describe('File Listing Isolation', () => {
    it('should NOT return files from other tenants', async () => {
      // Create files for two different tenants directly in DB
      await File.create({
        tenantId: TENANT_A,
        originalName: 'tenant-a-file.jpg',
        storageKey: 'tenant-a/file1.jpg',
        size: 1024,
        mimeType: 'image/jpeg',
        extension: 'jpg',
        uploader: USER_A,
        publicUrl: '/uploads/tenant-a/file1.jpg',
        status: 'active',
      });

      await File.create({
        tenantId: TENANT_B,
        originalName: 'tenant-b-file.jpg',
        storageKey: 'tenant-b/file1.jpg',
        size: 2048,
        mimeType: 'image/jpeg',
        extension: 'jpg',
        uploader: USER_B,
        publicUrl: '/uploads/tenant-b/file1.jpg',
        status: 'active',
      });

      // Tenant A should only see their own file
      const responseA = await request(app)
        .get('/api/files')
        .set(createAuthHeaders(TENANT_A, USER_A, 'user'));

      expect(responseA.status).toBe(200);
      expect(responseA.body.data.files).toHaveLength(1);
      expect(responseA.body.data.files[0].originalName).toBe('tenant-a-file.jpg');
      expect(responseA.body.data.files[0].tenantId).toBe(TENANT_A);

      // Tenant B should only see their own file
      const responseB = await request(app)
        .get('/api/files')
        .set(createAuthHeaders(TENANT_B, USER_B, 'user'));

      expect(responseB.status).toBe(200);
      expect(responseB.body.data.files).toHaveLength(1);
      expect(responseB.body.data.files[0].originalName).toBe('tenant-b-file.jpg');
      expect(responseB.body.data.files[0].tenantId).toBe(TENANT_B);
    });

    it('should return empty list for tenant with no files', async () => {
      // Create file for tenant A only
      await File.create({
        tenantId: TENANT_A,
        originalName: 'file.jpg',
        storageKey: 'tenant-a/file.jpg',
        size: 1024,
        mimeType: 'image/jpeg',
        extension: 'jpg',
        uploader: USER_A,
        publicUrl: '/uploads/file.jpg',
        status: 'active',
      });

      // Tenant B should get empty list (not tenant A's files)
      const response = await request(app)
        .get('/api/files')
        .set(createAuthHeaders(TENANT_B, USER_B, 'user'));

      expect(response.status).toBe(200);
      expect(response.body.data.files).toHaveLength(0);
    });
  });

  describe('File Retrieval by ID Isolation', () => {
    it('should NOT allow access to files from other tenants by ID', async () => {
      // Create file for tenant A
      const fileA = await File.create({
        tenantId: TENANT_A,
        originalName: 'confidential.pdf',
        storageKey: 'tenant-a/confidential.pdf',
        size: 5000,
        mimeType: 'application/pdf',
        extension: 'pdf',
        uploader: USER_A,
        publicUrl: '/uploads/confidential.pdf',
        status: 'active',
      });

      // Tenant B tries to access tenant A's file by ID
      const response = await request(app)
        .get(`/api/files/${fileA._id}`)
        .set(createAuthHeaders(TENANT_B, USER_B, 'user'));

      // Should return 404 (file not found for this tenant)
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/not found/i);
    });

    it('should allow access to own tenant files by ID', async () => {
      // Create file for tenant A
      const fileA = await File.create({
        tenantId: TENANT_A,
        originalName: 'report.pdf',
        storageKey: 'tenant-a/report.pdf',
        size: 3000,
        mimeType: 'application/pdf',
        extension: 'pdf',
        uploader: USER_A,
        publicUrl: '/uploads/report.pdf',
        status: 'active',
      });

      // Tenant A accesses their own file
      const response = await request(app)
        .get(`/api/files/${fileA._id}`)
        .set(createAuthHeaders(TENANT_A, USER_A, 'user'));

      expect(response.status).toBe(200);
      expect(response.body.data.file.id).toBe(fileA._id.toString());
      expect(response.body.data.file.tenantId).toBe(TENANT_A);
    });
  });

  describe('File Update Isolation', () => {
    it('should NOT allow updating files from other tenants', async () => {
      // Create file for tenant A
      const fileA = await File.create({
        tenantId: TENANT_A,
        originalName: 'original.jpg',
        storageKey: 'tenant-a/original.jpg',
        size: 2000,
        mimeType: 'image/jpeg',
        extension: 'jpg',
        uploader: USER_A,
        publicUrl: '/uploads/original.jpg',
        status: 'active',
        metadata: { description: 'Original description' },
      });

      // Tenant B tries to update tenant A's file
      const response = await request(app)
        .patch(`/api/files/${fileA._id}`)
        .set(createAuthHeaders(TENANT_B, USER_B, 'user'))
        .send({ description: 'Malicious update' });

      // Should return 404 (file not found for this tenant)
      expect(response.status).toBe(404);

      // Verify file was NOT updated
      const fileCheck = await File.findById(fileA._id);
      expect(fileCheck.metadata.description).toBe('Original description');
    });

    it('should allow updating own tenant files', async () => {
      // Create file for tenant A
      const fileA = await File.create({
        tenantId: TENANT_A,
        originalName: 'update-test.jpg',
        storageKey: 'tenant-a/update-test.jpg',
        size: 1500,
        mimeType: 'image/jpeg',
        extension: 'jpg',
        uploader: USER_A,
        publicUrl: '/uploads/update-test.jpg',
        status: 'active',
        metadata: { description: 'Original' },
      });

      // Tenant A updates their own file
      const response = await request(app)
        .patch(`/api/files/${fileA._id}`)
        .set(createAuthHeaders(TENANT_A, USER_A, 'user'))
        .send({ description: 'Updated description' });

      expect(response.status).toBe(200);
      expect(response.body.data.file.metadata.description).toBe('Updated description');

      // Verify in database
      const fileCheck = await File.findById(fileA._id);
      expect(fileCheck.metadata.description).toBe('Updated description');
    });
  });

  describe('File Deletion Isolation', () => {
    it('should NOT allow deleting files from other tenants', async () => {
      // Create file for tenant A
      const fileA = await File.create({
        tenantId: TENANT_A,
        originalName: 'protected.jpg',
        storageKey: 'tenant-a/protected.jpg',
        size: 3000,
        mimeType: 'image/jpeg',
        extension: 'jpg',
        uploader: USER_A,
        publicUrl: '/uploads/protected.jpg',
        status: 'active',
      });

      // Tenant B (as admin) tries to delete tenant A's file
      const response = await request(app)
        .delete(`/api/files/${fileA._id}`)
        .set(createAuthHeaders(TENANT_B, USER_B, 'admin'));

      // Should return 404 (file not found for this tenant)
      expect(response.status).toBe(404);

      // Verify file still exists and is active
      const fileCheck = await File.findById(fileA._id);
      expect(fileCheck).toBeTruthy();
      expect(fileCheck.status).toBe('active');
    });

    it('should allow admin to delete own tenant files', async () => {
      // Create file for tenant A
      const fileA = await File.create({
        tenantId: TENANT_A,
        originalName: 'delete-test.jpg',
        storageKey: 'tenant-a/delete-test.jpg',
        size: 2000,
        mimeType: 'image/jpeg',
        extension: 'jpg',
        uploader: USER_A,
        publicUrl: '/uploads/delete-test.jpg',
        status: 'active',
      });

      // Tenant A admin deletes their own file
      const response = await request(app)
        .delete(`/api/files/${fileA._id}`)
        .set(createAuthHeaders(TENANT_A, 'admin-user', 'admin'));

      expect(response.status).toBe(200);

      // Verify file is soft-deleted
      const fileCheck = await File.findById(fileA._id);
      expect(fileCheck.status).toBe('deleted');
    });
  });

  describe('Search and Filter Isolation', () => {
    it('should NOT return files from other tenants in search results', async () => {
      // Create files with similar names in different tenants
      await File.create({
        tenantId: TENANT_A,
        originalName: 'secret-report.pdf',
        storageKey: 'tenant-a/secret-report.pdf',
        size: 4000,
        mimeType: 'application/pdf',
        extension: 'pdf',
        uploader: USER_A,
        publicUrl: '/uploads/secret-report.pdf',
        status: 'active',
        metadata: { description: 'Tenant A secret data' },
      });

      await File.create({
        tenantId: TENANT_B,
        originalName: 'secret-report.pdf',
        storageKey: 'tenant-b/secret-report.pdf',
        size: 5000,
        mimeType: 'application/pdf',
        extension: 'pdf',
        uploader: USER_B,
        publicUrl: '/uploads/secret-report.pdf',
        status: 'active',
        metadata: { description: 'Tenant B secret data' },
      });

      // Tenant A searches for "secret"
      const responseA = await request(app)
        .get('/api/files?search=secret')
        .set(createAuthHeaders(TENANT_A, USER_A, 'user'));

      expect(responseA.status).toBe(200);
      expect(responseA.body.data.files).toHaveLength(1);
      expect(responseA.body.data.files[0].tenantId).toBe(TENANT_A);
      expect(responseA.body.data.files[0].metadata.description).toContain('Tenant A');

      // Tenant B searches for "secret"
      const responseB = await request(app)
        .get('/api/files?search=secret')
        .set(createAuthHeaders(TENANT_B, USER_B, 'user'));

      expect(responseB.status).toBe(200);
      expect(responseB.body.data.files).toHaveLength(1);
      expect(responseB.body.data.files[0].tenantId).toBe(TENANT_B);
      expect(responseB.body.data.files[0].metadata.description).toContain('Tenant B');
    });
  });

  describe('Admin Role Tenant Isolation', () => {
    it('should NOT allow admin from one tenant to access another tenant data', async () => {
      // Create file for tenant A
      const fileA = await File.create({
        tenantId: TENANT_A,
        originalName: 'tenant-a-admin-file.jpg',
        storageKey: 'tenant-a/admin-file.jpg',
        size: 1000,
        mimeType: 'image/jpeg',
        extension: 'jpg',
        uploader: USER_A,
        publicUrl: '/uploads/admin-file.jpg',
        status: 'active',
      });

      // Tenant B admin tries to access tenant A's file
      const response = await request(app)
        .get(`/api/files/${fileA._id}`)
        .set(createAuthHeaders(TENANT_B, 'admin-b', 'admin'));

      // Even as admin, should NOT access other tenant's data
      expect(response.status).toBe(404);
    });
  });
});
