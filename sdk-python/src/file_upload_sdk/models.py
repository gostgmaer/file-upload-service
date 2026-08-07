from __future__ import annotations

from datetime import datetime
from typing import Any, BinaryIO, Union

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

# ═══════════════════════════════════════════════════════════════════════════
# Response models
#
# Field names/shapes here are traced directly from this service's own
# source (src/controllers/fileController.js `formatFile()` and
# src/services/FileService.js `getFiles()`), not just the TS SDK's types —
# so they capture real inconsistencies in the API rather than an idealized
# shape:
#   - `formatFile()` (used by upload/get/confirm/multipart-complete) emits
#     `url`. `getFiles()` (list) returns raw Mongoose documents instead,
#     which serialize `publicUrl`. Both are accepted here.
#   - Raw list documents also carry Mongo's `_id` rather than `formatFile()`'s
#     `id`. Both are accepted.
# ═══════════════════════════════════════════════════════════════════════════


class FileMetadata(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    description: str = ""
    tags: list[str] = Field(default_factory=list)
    custom: dict[str, Any] = Field(default_factory=dict)
    title: str = ""
    alt_text: str = Field(default="", alias="altText")
    author: str = ""
    source: str = ""
    language: str = ""
    expires_at: datetime | None = Field(default=None, alias="expiresAt")
    is_public: bool = Field(default=False, alias="isPublic")
    linked_to: dict[str, str] = Field(default_factory=dict, alias="linkedTo")


class FileVersion(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    version_number: int = Field(alias="versionNumber")
    storage_key: str = Field(alias="storageKey")
    size: int
    uploaded_by: str = Field(default="", alias="uploadedBy")
    created_at: datetime | None = Field(default=None, alias="createdAt")


class FileRecord(BaseModel):
    """A file's full metadata, as returned by upload/get/rename/update/replace/confirm."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str = Field(validation_alias=AliasChoices("id", "_id"))
    tenant_id: str = Field(default="", alias="tenantId")
    original_name: str = Field(alias="originalName")
    storage_key: str = Field(default="", alias="storageKey")
    size: int = 0
    mime_type: str = Field(default="", alias="mimeType")
    extension: str = ""
    uploader: str = "anonymous"
    category: str = ""
    status: str = "active"
    scan_status: str = Field(default="", alias="scanStatus")
    url: str | None = Field(
        default=None, validation_alias=AliasChoices("url", "publicUrl")
    )
    metadata: FileMetadata = Field(default_factory=FileMetadata)
    technical_metadata: dict[str, Any] | None = Field(
        default=None, alias="technicalMetadata"
    )
    versions: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class PaginationInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    page: int
    limit: int
    total: int
    pages: int


class FileListData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    files: list[FileRecord] = Field(default_factory=list)
    pagination: PaginationInfo


class TransactionRecord(BaseModel):
    """Admin-only audit trail entry — GET /api/files/:id/transactions."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str = Field(default="", validation_alias=AliasChoices("id", "_id"))
    tenant_id: str = Field(default="", alias="tenantId")
    file_id: str = Field(default="", alias="fileId")
    operation: str = ""
    status: str = ""
    performed_by: str = Field(default="", alias="performedBy")
    request_id: str = Field(default="", alias="requestId")
    payload: dict[str, Any] = Field(default_factory=dict)
    provider_response: dict[str, Any] = Field(
        default_factory=dict, alias="providerResponse"
    )
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class PresignedUploadResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    file_id: str = Field(alias="fileId")
    upload_url: str = Field(alias="uploadUrl")
    expires_at: str = Field(default="", alias="expiresAt")


class MultipartInitiateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    file_id: str = Field(alias="fileId")
    upload_id: str = Field(alias="uploadId")


class MultipartPartUrl(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    part_number: int = Field(alias="partNumber")
    upload_url: str = Field(alias="uploadUrl")


class MultipartPartUrlsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    file_id: str = Field(alias="fileId")
    upload_id: str = Field(alias="uploadId")
    parts: list[MultipartPartUrl] = Field(default_factory=list)


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str
    service: str = ""
    version: str = ""
    timestamp: str = ""
    uptime: float = 0
    db: str = ""
    memory: dict[str, float] = Field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════
# Request models
# ═══════════════════════════════════════════════════════════════════════════


class UploadFileInput(BaseModel):
    """A single file to upload.

    ``file`` may be a path on disk (str), raw bytes, or a file-like object
    with ``.read()`` (e.g. ``io.BytesIO``, an open file handle).
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    file: Union[str, bytes, BinaryIO]
    filename: str | None = None
    content_type: str | None = None


class UploadMetadata(BaseModel):
    """Optional metadata attached to an upload/presign/multipart-initiate call."""

    model_config = ConfigDict(populate_by_name=True)

    category: str | None = None
    description: str | None = None
    tags: str | list[str] | None = None
    custom: dict[str, Any] | str | None = None
    title: str | None = None
    alt_text: str | None = Field(default=None, alias="altText")
    author: str | None = None
    source: str | None = None
    language: str | None = None
    expires_at: datetime | str | None = Field(default=None, alias="expiresAt")
    is_public: bool | None = Field(default=None, alias="isPublic")
    linked_entity_type: str | None = Field(default=None, alias="linkedEntityType")
    linked_entity_id: str | None = Field(default=None, alias="linkedEntityId")

    def to_api_dict(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True, exclude_none=True)


class ListFilesFilters(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    page: int | None = None
    limit: int | None = None
    sort: str | None = None
    search: str | None = None
    mime_type: str | None = Field(default=None, alias="mimeType")
    category: str | None = None
    tags: str | list[str] | None = None
    uploader: str | None = None
    language: str | None = None
    is_public: bool | None = Field(default=None, alias="isPublic")
    linked_entity_type: str | None = Field(default=None, alias="linkedEntityType")
    linked_entity_id: str | None = Field(default=None, alias="linkedEntityId")
    date_from: datetime | str | None = Field(default=None, alias="dateFrom")
    date_to: datetime | str | None = Field(default=None, alias="dateTo")

    def to_query_dict(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True, exclude_none=True)


class UpdateMetadataInput(BaseModel):
    """Body for PATCH /api/files/:id — a partial update; only set fields are sent."""

    model_config = ConfigDict(populate_by_name=True)

    original_name: str | None = Field(default=None, alias="originalName")
    category: str | None = None
    description: str | None = None
    title: str | None = None
    alt_text: str | None = Field(default=None, alias="altText")
    author: str | None = None
    source: str | None = None
    language: str | None = None
    expires_at: datetime | str | None = Field(default=None, alias="expiresAt")
    is_public: bool | None = Field(default=None, alias="isPublic")
    tags: list[str] | None = None
    custom: dict[str, Any] | None = None
    linked_entity_type: str | None = Field(default=None, alias="linkedEntityType")
    linked_entity_id: str | None = Field(default=None, alias="linkedEntityId")

    def to_api_dict(self) -> dict[str, Any]:
        """Nest the metadata sub-fields the way PATCH /api/files/:id expects:
        {originalName, category, metadata: {description, tags, ...}}."""
        top: dict[str, Any] = {}
        if self.original_name is not None:
            top["originalName"] = self.original_name
        if self.category is not None:
            top["category"] = self.category

        metadata: dict[str, Any] = {}
        if self.description is not None:
            metadata["description"] = self.description
        if self.title is not None:
            metadata["title"] = self.title
        if self.alt_text is not None:
            metadata["altText"] = self.alt_text
        if self.author is not None:
            metadata["author"] = self.author
        if self.source is not None:
            metadata["source"] = self.source
        if self.language is not None:
            metadata["language"] = self.language
        if self.is_public is not None:
            metadata["isPublic"] = self.is_public
        if self.expires_at is not None:
            metadata["expiresAt"] = (
                self.expires_at.isoformat()
                if isinstance(self.expires_at, datetime)
                else self.expires_at
            )
        if self.tags is not None:
            metadata["tags"] = self.tags
        if self.custom is not None:
            metadata["custom"] = self.custom
        if self.linked_entity_type is not None or self.linked_entity_id is not None:
            metadata["linkedTo"] = {
                "entityType": self.linked_entity_type or "",
                "entityId": self.linked_entity_id or "",
            }

        if metadata:
            top["metadata"] = metadata
        return top


class PresignedUploadRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    filename: str
    content_type: str = Field(alias="contentType")
    size: int
    expires_in: int | None = Field(default=None, alias="expiresIn")
    metadata: UploadMetadata | None = None

    def to_api_dict(self) -> dict[str, Any]:
        body = self.model_dump(
            by_alias=True, exclude_none=True, exclude={"metadata"}
        )
        if self.metadata:
            body.update(self.metadata.to_api_dict())
        return body


class MultipartUploadInitiateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    filename: str
    content_type: str = Field(alias="contentType")
    size: int
    metadata: UploadMetadata | None = None

    def to_api_dict(self) -> dict[str, Any]:
        body = self.model_dump(
            by_alias=True, exclude_none=True, exclude={"metadata"}
        )
        if self.metadata:
            body.update(self.metadata.to_api_dict())
        return body


class MultipartPart(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    part_number: int = Field(alias="partNumber")
    etag: str

    def to_api_dict(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True)
