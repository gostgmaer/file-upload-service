export interface UserContext {
  userId?: string;
  userRole?: string;
  userEmail?: string;
  userName?: string;
  tenantId?: string;
}

export interface FileUploadClientConfig extends UserContext {
  baseUrl: string;
  gatewaySecret?: string;
}

export interface RequestOptions extends UserContext {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface UploadFileInput {
  file: string | Buffer | NodeJS.ReadableStream | Blob;
  filename?: string;
  contentType?: string;
}

export interface UploadMetadata {
  category?: string;
  description?: string;
  tags?: string | string[];
  custom?: Record<string, any> | string;
  title?: string;
  altText?: string;
  author?: string;
  source?: string;
  language?: string;
  expiresAt?: Date | string;
  isPublic?: boolean;
  linkedEntityType?: string;
  linkedEntityId?: string;
}

export interface ListFilesFilters {
  page?: number;
  limit?: number;
  sort?: 'originalName' | '-originalName' | 'size' | '-size' | 'createdAt' | '-createdAt' | 'updatedAt' | '-updatedAt' | string;
  search?: string;
  mimeType?: string;
  category?: string;
  tags?: string | string[];
  uploader?: string;
  language?: string;
  isPublic?: boolean;
  linkedEntityType?: string;
  linkedEntityId?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
}

export interface UpdateMetadataInput {
  originalName?: string;
  category?: string;
  metadata?: {
    description?: string;
    tags?: string[];
    custom?: Record<string, any>;
    title?: string;
    altText?: string;
    author?: string;
    source?: string;
    language?: string;
    expiresAt?: Date | string | null;
    isPublic?: boolean;
    linkedTo?: {
      entityType?: string;
      entityId?: string;
    };
  };
}

export interface BulkUpdateMetadataInput {
  category?: string;
  metadata?: {
    description?: string;
    tags?: string[];
    custom?: Record<string, any>;
    title?: string;
    altText?: string;
    author?: string;
    source?: string;
    language?: string;
    expiresAt?: Date | string | null;
    isPublic?: boolean;
    linkedTo?: {
      entityType?: string;
      entityId?: string;
    };
  };
}

export interface PresignedUploadRequest extends UploadMetadata {
  filename: string;
  contentType: string;
  size: number;
  expiresIn?: number; // 60 to 604800 seconds
}

export interface MultipartUploadInitiateRequest extends UploadMetadata {
  filename: string;
  contentType: string;
  size: number;
}

export interface MultipartPart {
  partNumber: number;
  etag: string;
}

// ─── Response Interfaces ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message?: string;
  data: T;
  timestamp: string;
  requestId: string;
}

export interface FileMetadata {
  description?: string;
  title?: string;
  altText?: string;
  author?: string;
  source?: string;
  language?: string;
  expiresAt?: string | null;
  isPublic: boolean;
  tags: string[];
  custom: Record<string, any>;
  linkedTo?: {
    entityType?: string;
    entityId?: string;
  };
}

export interface FileVersion {
  versionNumber: number;
  storageKey: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
}

export interface FileRecord {
  id: string;
  tenantId: string;
  originalName: string;
  storageKey: string;
  size: number;
  mimeType: string;
  extension: string;
  uploader: string;
  publicUrl?: string;
  category?: string;
  metadata: FileMetadata;
  versions: FileVersion[];
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

export interface UploadedFileSummary {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  category?: string;
  url: string;
  metadata: FileMetadata;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ListFilesData {
  files: FileRecord[];
  pagination: PaginationInfo;
}

export interface TransactionRecord {
  id: string;
  tenantId: string;
  fileId: string;
  operation: 'upload' | 'rename' | 'update_metadata' | 'replace' | 'delete' | 'permanent_delete';
  status: 'success' | 'failure';
  performedBy: string;
  requestId: string;
  payload: Record<string, any>;
  providerResponse?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface PresignedUploadResponse {
  fileId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface MultipartInitiateResponse {
  fileId: string;
  uploadId: string;
}

export interface MultipartPartUrl {
  partNumber: number;
  uploadUrl: string;
}

export interface MultipartPartUrlsResponse {
  fileId: string;
  uploadId: string;
  parts: MultipartPartUrl[];
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
  db: string;
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
}
