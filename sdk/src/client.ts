import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  FileUploadClientConfig,
  UserContext,
  RequestOptions,
  UploadFileInput,
  UploadMetadata,
  ListFilesFilters,
  UpdateMetadataInput,
  BulkUpdateMetadataInput,
  PresignedUploadRequest,
  MultipartUploadInitiateRequest,
  MultipartPart,
  ApiResponse,
  FileRecord,
  UploadedFileSummary,
  ListFilesData,
  TransactionRecord,
  PresignedUploadResponse,
  MultipartInitiateResponse,
  MultipartPartUrlsResponse,
  HealthResponse
} from './types.js';

export class FileUploadError extends Error {
  public statusCode: number;
  public errorCode?: string;
  public details?: any;

  constructor(message: string, statusCode: number, errorCode?: string, details?: any) {
    super(message);
    this.name = 'FileUploadError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export class FileUploadClient {
  private config: FileUploadClientConfig;

  constructor(config?: Partial<FileUploadClientConfig>) {
    // Read environments or fall back to standard defaults
    this.config = {
      baseUrl: config?.baseUrl || process.env.FILE_SERVICE_URL || 'http://localhost:4001',
      tenantId: config?.tenantId || process.env.FILE_SERVICE_TENANT_ID || 'easydev',
      gatewaySecret: config?.gatewaySecret || process.env.FILE_SERVICE_HMAC_SECRET || process.env.GATEWAY_INTERNAL_SECRET,
      userId: config?.userId || process.env.FILE_SERVICE_USER_ID || 'anonymous',
      userRole: config?.userRole || process.env.FILE_SERVICE_USER_ROLE || 'anonymous',
      userEmail: config?.userEmail || process.env.FILE_SERVICE_USER_EMAIL || '',
      userName: config?.userName || process.env.FILE_SERVICE_USER_NAME || '',
    };

    // Ensure baseUrl does not end with a slash for clean concatenation
    if (this.config.baseUrl.endsWith('/')) {
      this.config.baseUrl = this.config.baseUrl.slice(0, -1);
    }
  }

  /**
   * Clone the client configured with a specific user's context (e.g. for server-to-server forwarding).
   */
  public asUser(userContext: UserContext): FileUploadClient {
    return new FileUploadClient({
      ...this.config,
      ...userContext,
    });
  }

  /**
   * Retrieve the health status of the file upload service.
   */
  public async getHealth(options?: RequestOptions): Promise<HealthResponse> {
    const url = `${this.config.baseUrl}/health`;
    const response = await this.request<HealthResponse>(url, {
      method: 'GET',
      ...options,
      skipAuth: true,
    });
    return response;
  }

  /**
   * Upload one or more files to the file upload service.
   */
  public async uploadFiles(
    files: UploadFileInput[],
    metadata?: UploadMetadata,
    options?: RequestOptions
  ): Promise<ApiResponse<UploadedFileSummary[]>> {
    const url = `${this.config.baseUrl}/api/files/upload`;
    const formData = new FormData();

    for (const fileInput of files) {
      const { fileBlob, filename } = await this.resolveFileInput(fileInput);
      formData.append('files', fileBlob, filename);
    }

    if (metadata) {
      this.appendMetadataToFormData(formData, metadata);
    }

    return this.request<ApiResponse<UploadedFileSummary[]>>(url, {
      method: 'POST',
      body: formData,
      ...options,
    });
  }

  /**
   * List files with pagination, sorting, search, and metadata filters.
   */
  public async listFiles(
    filters?: ListFilesFilters,
    options?: RequestOptions
  ): Promise<ApiResponse<ListFilesData>> {
    const query = this.buildQueryString(filters);
    const url = `${this.config.baseUrl}/api/files${query}`;

    return this.request<ApiResponse<ListFilesData>>(url, {
      method: 'GET',
      ...options,
    });
  }

  /**
   * Retrieve a file's complete metadata.
   */
  public async getFileMetadata(
    fileId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<FileRecord>> {
    const url = `${this.config.baseUrl}/api/files/${fileId}`;

    return this.request<ApiResponse<FileRecord>>(url, {
      method: 'GET',
      ...options,
    });
  }

  /**
   * Download a file.
   * If inline is set, headers will prompt inline preview.
   * If signed is set (for cloud providers), it returns a redirect URL to download the file directly from the provider.
   */
  public async downloadFile(
    fileId: string,
    downloadOptions?: { inline?: boolean; signed?: boolean },
    options?: RequestOptions
  ): Promise<Response> {
    const params = new URLSearchParams();
    if (downloadOptions?.inline) params.set('inline', '1');
    if (downloadOptions?.signed) params.set('signed', '1');

    const query = params.toString() ? `?${params.toString()}` : '';
    const url = `${this.config.baseUrl}/api/files/${fileId}/download${query}`;

    const headers = this.buildHeaders(options);

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: options?.signal,
      // If signed is requested, we do NOT want to follow redirect automatically if the caller wants the redirect URL.
      // However, fetch by default follows redirects. Let's allow standard fetch behavior.
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response;
  }

  /**
   * Generate a browser download URL or local signed download URL.
   * Useful when passing a link directly to a frontend client.
   */
  public getDownloadUrl(fileId: string, downloadOptions?: { inline?: boolean; signed?: boolean }): string {
    const params = new URLSearchParams();
    if (downloadOptions?.inline) params.set('inline', '1');
    if (downloadOptions?.signed) params.set('signed', '1');
    const query = params.toString() ? `?${params.toString()}` : '';
    return `${this.config.baseUrl}/api/files/${fileId}/download${query}`;
  }

  /**
   * Rename a file.
   */
  public async renameFile(
    fileId: string,
    newName: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ file: FileRecord }>> {
    const url = `${this.config.baseUrl}/api/files/${fileId}/rename`;

    return this.request<ApiResponse<{ file: FileRecord }>>(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
      ...options,
    });
  }

  /**
   * Update file metadata.
   */
  public async updateFileMetadata(
    fileId: string,
    metadata: UpdateMetadataInput,
    options?: RequestOptions
  ): Promise<ApiResponse<{ file: FileRecord }>> {
    const url = `${this.config.baseUrl}/api/files/${fileId}`;

    return this.request<ApiResponse<{ file: FileRecord }>>(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
      ...options,
    });
  }

  /**
   * Replace the binary content of a file. The old version will be archived.
   */
  public async replaceFile(
    fileId: string,
    fileInput: UploadFileInput,
    options?: RequestOptions
  ): Promise<ApiResponse<{ file: FileRecord }>> {
    const url = `${this.config.baseUrl}/api/files/${fileId}/replace`;
    const formData = new FormData();

    const { fileBlob, filename } = await this.resolveFileInput(fileInput);
    formData.append('file', fileBlob, filename);

    return this.request<ApiResponse<{ file: FileRecord }>>(url, {
      method: 'PUT',
      body: formData,
      ...options,
    });
  }

  /**
   * Soft delete a file (sets status: 'deleted').
   */
  public async deleteFile(
    fileId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ file: FileRecord }>> {
    const url = `${this.config.baseUrl}/api/files/${fileId}`;

    return this.request<ApiResponse<{ file: FileRecord }>>(url, {
      method: 'DELETE',
      ...options,
    });
  }

  /**
   * Permanently delete a file from both DB and cloud/disk storage.
   */
  public async permanentDeleteFile(
    fileId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<void>> {
    const url = `${this.config.baseUrl}/api/files/${fileId}/permanent`;

    return this.request<ApiResponse<void>>(url, {
      method: 'DELETE',
      ...options,
    });
  }

  /**
   * Bulk soft-delete or permanent-delete multiple files.
   */
  public async bulkDelete(
    fileIds: string[],
    deleteOptions?: { permanent?: boolean },
    options?: RequestOptions
  ): Promise<ApiResponse<void>> {
    const pathSuffix = deleteOptions?.permanent ? 'permanent-delete' : 'delete';
    const url = `${this.config.baseUrl}/api/files/bulk/${pathSuffix}`;

    return this.request<ApiResponse<void>>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: fileIds }),
      ...options,
    });
  }

  /**
   * Bulk update metadata for multiple files.
   */
  public async bulkUpdateMetadata(
    fileIds: string[],
    updates: BulkUpdateMetadataInput,
    options?: RequestOptions
  ): Promise<ApiResponse<void>> {
    const url = `${this.config.baseUrl}/api/files/bulk/metadata`;

    return this.request<ApiResponse<void>>(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: fileIds, updates }),
      ...options,
    });
  }

  /**
   * Bulk generate signed URLs for multiple files.
   */
  public async bulkGetSignedUrls(
    fileIds: string[],
    expiry?: number, // 60 to 604800 seconds
    options?: RequestOptions
  ): Promise<ApiResponse<Record<string, string>>> {
    const url = `${this.config.baseUrl}/api/files/bulk/signed-urls`;

    return this.request<ApiResponse<Record<string, string>>>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: fileIds, expiry }),
      ...options,
    });
  }

  /**
   * Get the transaction history (audit trail) for a file.
   */
  public async getFileTransactions(
    fileId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<TransactionRecord[]>> {
    const url = `${this.config.baseUrl}/api/files/${fileId}/transactions`;

    return this.request<ApiResponse<TransactionRecord[]>>(url, {
      method: 'GET',
      ...options,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRESIGNED CLOUD UPLOADS (S3, GCS, Azure, R2)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Step 1: Request a presigned URL to upload a file directly to the cloud.
   */
  public async requestPresignedUpload(
    request: PresignedUploadRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<PresignedUploadResponse>> {
    const url = `${this.config.baseUrl}/api/files/upload/presign`;

    const body: Record<string, any> = {
      filename: request.filename,
      contentType: request.contentType,
      size: request.size,
    };

    if (request.expiresIn) body.expiresIn = request.expiresIn;
    this.appendMetadataToBodyObject(body, request);

    return this.request<ApiResponse<PresignedUploadResponse>>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...options,
    });
  }

  /**
   * Step 2: Confirm a direct presigned cloud upload has completed successfully.
   */
  public async confirmPresignedUpload(
    fileId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<FileRecord>> {
    const url = `${this.config.baseUrl}/api/files/upload/presign/${fileId}/confirm`;

    return this.request<ApiResponse<FileRecord>>(url, {
      method: 'POST',
      ...options,
    });
  }

  /**
   * Initiate a multipart upload session for large files (S3/R2).
   */
  public async initiateMultipartUpload(
    request: MultipartUploadInitiateRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<MultipartInitiateResponse>> {
    const url = `${this.config.baseUrl}/api/files/upload/multipart/initiate`;

    const body: Record<string, any> = {
      filename: request.filename,
      contentType: request.contentType,
      size: request.size,
    };
    this.appendMetadataToBodyObject(body, request);

    return this.request<ApiResponse<MultipartInitiateResponse>>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...options,
    });
  }

  /**
   * Request upload URLs for specific part numbers in a multipart upload.
   */
  public async getMultipartPartUrls(
    fileId: string,
    partNumbers: number[],
    options?: RequestOptions
  ): Promise<ApiResponse<MultipartPartUrlsResponse>> {
    const url = `${this.config.baseUrl}/api/files/upload/multipart/${fileId}/parts`;

    return this.request<ApiResponse<MultipartPartUrlsResponse>>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partNumbers }),
      ...options,
    });
  }

  /**
   * Complete a multipart upload session.
   */
  public async completeMultipartUpload(
    fileId: string,
    parts: MultipartPart[],
    options?: RequestOptions
  ): Promise<ApiResponse<FileRecord>> {
    const url = `${this.config.baseUrl}/api/files/upload/multipart/${fileId}/complete`;

    return this.request<ApiResponse<FileRecord>>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts }),
      ...options,
    });
  }

  /**
   * Abort a multipart upload session.
   */
  public async abortMultipartUpload(
    fileId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<void>> {
    const url = `${this.config.baseUrl}/api/files/upload/multipart/${fileId}/abort`;

    return this.request<ApiResponse<void>>(url, {
      method: 'DELETE',
      ...options,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Perform fetch requests and verify status code, mapping API error envelopes.
   */
  private async request<T>(
    url: string,
    requestOpts: RequestInit & RequestOptions & { skipAuth?: boolean }
  ): Promise<T> {
    const { skipAuth, headers: customHeaders, signal, ...fetchOpts } = requestOpts;

    const headers = skipAuth ? new Headers() : this.buildHeaders(requestOpts);

    if (customHeaders) {
      for (const [key, value] of Object.entries(customHeaders)) {
        headers.set(key, value);
      }
    }

    const response = await fetch(url, {
      ...fetchOpts,
      headers,
      signal,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json();
    return data as T;
  }

  /**
   * Construct gateway and tenant context headers for the request.
   */
  private buildHeaders(userContext?: UserContext): Headers {
    const userId = userContext?.userId || this.config.userId || 'anonymous';
    const userRole = userContext?.userRole || this.config.userRole || 'anonymous';
    const userEmail = userContext?.userEmail || this.config.userEmail || '';
    const userName = userContext?.userName || this.config.userName || '';
    const tenantId = userContext?.tenantId || this.config.tenantId || 'easydev';

    const headers = new Headers();
    headers.set('X-Tenant-Id', tenantId);
    headers.set('X-User-Id', userId);
    headers.set('X-User-Role', userRole);

    if (userEmail) headers.set('X-User-Email', userEmail);
    if (userName) headers.set('X-User-Name', userName);

    const secret = this.config.gatewaySecret;
    if (secret) {
      const payload = `${userId}:${userEmail}:${userRole}`;
      const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      headers.set('X-Gateway-HMAC', hmac);
    }

    return headers;
  }

  /**
   * Handle an HTTP error response, parsing the structured error envelope.
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorBody: any;
    try {
      errorBody = await response.json();
    } catch {
      // JSON parsing failed, fallback to plain text status
      throw new FileUploadError(
        `HTTP Error ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    const message = errorBody?.message || `HTTP Error ${response.status}`;
    const code = errorBody?.error?.code || undefined;
    const details = errorBody?.error?.errors || undefined;

    throw new FileUploadError(message, response.status, code, details);
  }

  /**
   * Convert file inputs into standard Blob targets for FormData.
   */
  private async resolveFileInput(input: UploadFileInput): Promise<{ fileBlob: Blob; filename: string }> {
    const file = input.file;

    // Case 1: String path on disk (Node.js)
    if (typeof file === 'string') {
      const filename = input.filename || path.basename(file);
      let fileBlob: Blob;

      if (typeof fs.openAsBlob === 'function') {
        fileBlob = await fs.openAsBlob(file);
      } else {
        const buffer = fs.readFileSync(file);
        fileBlob = new Blob([buffer as any], { type: input.contentType });
      }

      return { fileBlob, filename };
    }

    // Case 2: Buffer or Uint8Array
    if (Buffer.isBuffer(file) || file instanceof Uint8Array) {
      const fileBlob = new Blob([file as any], { type: input.contentType });
      const filename = input.filename || 'file.bin';
      return { fileBlob, filename };
    }

    // Case 3: Stream (NodeJS.ReadableStream)
    if (file && typeof (file as any)[Symbol.asyncIterator] === 'function') {
      const chunks: any[] = [];
      for await (const chunk of file as any) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const fileBlob = new Blob([buffer as any], { type: input.contentType });
      const filename = input.filename || 'file.bin';
      return { fileBlob, filename };
    }

    // Case 4: Web Blob or File
    if (file instanceof Blob) {
      const filename = input.filename || (file as any).name || 'file.bin';
      return { fileBlob: file, filename };
    }

    throw new Error('Unsupported file input type');
  }

  /**
   * Add query filters to URLSearchParams.
   */
  private buildQueryString(filters?: ListFilesFilters): string {
    if (!filters) return '';
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;

      if (key === 'tags') {
        const tagsArr = Array.isArray(value) ? value : [value];
        tagsArr.forEach((t) => params.append('tags', t));
      } else if (value instanceof Date) {
        params.set(key, value.toISOString());
      } else {
        params.set(key, String(value));
      }
    }

    const str = params.toString();
    return str ? `?${str}` : '';
  }

  /**
   * Serialize metadata into form-data format.
   */
  private appendMetadataToFormData(formData: FormData, metadata: UploadMetadata): void {
    if (metadata.category) formData.append('category', metadata.category);
    if (metadata.description) formData.append('description', metadata.description);
    if (metadata.title) formData.append('title', metadata.title);
    if (metadata.altText) formData.append('altText', metadata.altText);
    if (metadata.author) formData.append('author', metadata.author);
    if (metadata.source) formData.append('source', metadata.source);
    if (metadata.language) formData.append('language', metadata.language);
    if (metadata.isPublic !== undefined) formData.append('isPublic', String(metadata.isPublic));

    if (metadata.expiresAt) {
      const dateStr = metadata.expiresAt instanceof Date ? metadata.expiresAt.toISOString() : metadata.expiresAt;
      formData.append('expiresAt', dateStr);
    }
    if (metadata.linkedEntityType) formData.append('linkedEntityType', metadata.linkedEntityType);
    if (metadata.linkedEntityId) formData.append('linkedEntityId', metadata.linkedEntityId);

    if (metadata.tags) {
      const tagsArr = Array.isArray(metadata.tags) ? metadata.tags : [metadata.tags];
      tagsArr.forEach((t) => formData.append('tags', t));
    }

    if (metadata.custom) {
      const customStr = typeof metadata.custom === 'object' ? JSON.stringify(metadata.custom) : metadata.custom;
      formData.append('custom', customStr);
    }
  }

  /**
   * Append metadata properties directly to a request body object (used for JSON APIs like presign).
   */
  private appendMetadataToBodyObject(body: Record<string, any>, metadata: UploadMetadata): void {
    if (metadata.category) body.category = metadata.category;
    if (metadata.description) body.description = metadata.description;
    if (metadata.title) body.title = metadata.title;
    if (metadata.altText) body.altText = metadata.altText;
    if (metadata.author) body.author = metadata.author;
    if (metadata.source) body.source = metadata.source;
    if (metadata.language) body.language = metadata.language;
    if (metadata.isPublic !== undefined) body.isPublic = metadata.isPublic;

    if (metadata.expiresAt) {
      body.expiresAt = metadata.expiresAt instanceof Date ? metadata.expiresAt.toISOString() : metadata.expiresAt;
    }
    if (metadata.linkedEntityType) body.linkedEntityType = metadata.linkedEntityType;
    if (metadata.linkedEntityId) body.linkedEntityId = metadata.linkedEntityId;

    if (metadata.tags) {
      body.tags = Array.isArray(metadata.tags) ? metadata.tags : [metadata.tags];
    }

    if (metadata.custom) {
      body.custom = typeof metadata.custom === 'object' ? metadata.custom : JSON.parse(metadata.custom);
    }
  }
}
