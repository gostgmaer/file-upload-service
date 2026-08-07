from __future__ import annotations

from typing import Any, Iterable, Mapping
from urllib.parse import urlencode

import httpx

from ._shared import (
    ClientConfig,
    build_headers,
    build_query_string,
    flatten_form_fields,
    raise_for_status,
    resolve_config,
    resolve_file_input,
    unwrap,
)
from .exceptions import FileUploadError
from .models import (
    FileListData,
    FileRecord,
    HealthResponse,
    ListFilesFilters,
    MultipartInitiateResponse,
    MultipartPart,
    MultipartPartUrlsResponse,
    MultipartUploadInitiateRequest,
    PresignedUploadRequest,
    PresignedUploadResponse,
    TransactionRecord,
    UpdateMetadataInput,
    UploadFileInput,
    UploadMetadata,
)

__all__ = ["FileUploadClient", "FileUploadError"]

_IdentityKwargs = Mapping[str, Any]


class FileUploadClient:
    """Synchronous client for the multi-tenant File Upload Service.

    Every method sends the caller's identity as plain headers
    (X-Tenant-Id / X-User-Id / X-User-Role / ...) — the service trusts
    these as-is (see src/middleware/tenant.js), it does not verify them.
    Pass the real caller's identity via the constructor or per-call
    ``user_id=``/``user_role=``/``tenant_id=`` kwargs; don't rely on the
    'anonymous'/'easydev' defaults for anything that matters.

    Admin-gated routes (permanent delete, transactions, all bulk/*
    operations — see src/routes/fileRoutes.js's requireAdmin guards) require
    ``user_role="admin"`` on that specific call. ``delete_file`` (soft
    delete) instead requires ownership: any non-anonymous ``user_id`` works,
    but it must match the file's uploader (tenant + uploader match,
    enforced server-side via FileService.getFileById) — admin bypasses this
    and can delete any file. Everything else (upload, list, get, download,
    rename, update, replace) is public and works with the 'anonymous'
    default.
    """

    def __init__(
        self,
        base_url: str | None = None,
        *,
        tenant_id: str | None = None,
        gateway_secret: str | None = None,
        user_id: str | None = None,
        user_role: str | None = None,
        user_email: str | None = None,
        user_name: str | None = None,
        timeout: float | httpx.Timeout | None = 30.0,
    ) -> None:
        self._config: ClientConfig = resolve_config(
            base_url=base_url,
            tenant_id=tenant_id,
            gateway_secret=gateway_secret,
            user_id=user_id,
            user_role=user_role,
            user_email=user_email,
            user_name=user_name,
        )
        self._http = httpx.Client(timeout=timeout)

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "FileUploadClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def as_user(
        self,
        *,
        user_id: str | None = None,
        user_role: str | None = None,
        user_email: str | None = None,
        user_name: str | None = None,
        tenant_id: str | None = None,
    ) -> "FileUploadClient":
        """Clone this client scoped to a specific end-user's identity —
        use this for server-to-server forwarding instead of mutating
        shared client state."""
        return FileUploadClient(
            base_url=self._config.base_url,
            tenant_id=tenant_id or self._config.tenant_id,
            gateway_secret=self._config.gateway_secret,
            user_id=user_id or self._config.user_id,
            user_role=user_role or self._config.user_role,
            user_email=user_email or self._config.user_email,
            user_name=user_name or self._config.user_name,
        )

    # ── low-level request helpers ────────────────────────────────────────

    def _headers(self, identity: _IdentityKwargs) -> dict[str, str]:
        return build_headers(
            self._config,
            user_id=identity.get("user_id"),
            user_role=identity.get("user_role"),
            user_email=identity.get("user_email"),
            user_name=identity.get("user_name"),
            tenant_id=identity.get("tenant_id"),
        )

    def _request(
        self,
        method: str,
        url: str,
        *,
        identity: _IdentityKwargs | None = None,
        skip_auth: bool = False,
        **kwargs: Any,
    ) -> httpx.Response:
        headers = {} if skip_auth else self._headers(identity or {})
        extra_headers = kwargs.pop("headers", None)
        if extra_headers:
            headers.update(extra_headers)
        response = self._http.request(method, url, headers=headers, **kwargs)
        raise_for_status(response)
        return response

    # ── health ───────────────────────────────────────────────────────────

    def get_health(self) -> HealthResponse:
        url = f"{self._config.base_url}/health"
        response = self._request("GET", url, skip_auth=True)
        return HealthResponse.model_validate(response.json())

    # ── upload ───────────────────────────────────────────────────────────

    def upload_files(
        self,
        files: Iterable[UploadFileInput],
        metadata: UploadMetadata | None = None,
        **identity: Any,
    ) -> list[FileRecord]:
        url = f"{self._config.base_url}/api/files/upload"
        httpx_files = []
        for f in files:
            filename, content, content_type = resolve_file_input(f)
            httpx_files.append(
                ("files", (filename, content, content_type or "application/octet-stream"))
            )
        data = flatten_form_fields(metadata.to_api_dict()) if metadata else None

        response = self._request(
            "POST", url, identity=identity, data=data, files=httpx_files
        )
        return [FileRecord.model_validate(item) for item in unwrap(response)]

    # ── list / get / download ───────────────────────────────────────────

    def list_files(
        self, filters: ListFilesFilters | None = None, **identity: Any
    ) -> FileListData:
        query = build_query_string(filters.to_query_dict() if filters else None)
        url = f"{self._config.base_url}/api/files{query}"
        response = self._request("GET", url, identity=identity)
        return FileListData.model_validate(unwrap(response))

    def get_file_metadata(self, file_id: str, **identity: Any) -> FileRecord:
        url = f"{self._config.base_url}/api/files/{file_id}"
        response = self._request("GET", url, identity=identity)
        return FileRecord.model_validate(unwrap(response))

    def download_file(
        self,
        file_id: str,
        *,
        inline: bool = False,
        signed: bool = False,
        **identity: Any,
    ) -> httpx.Response:
        """Returns the raw httpx.Response (binary content in .content /
        .iter_bytes()) — the download route doesn't use the JSON envelope."""
        params = {}
        if inline:
            params["inline"] = "1"
        if signed:
            params["signed"] = "1"
        query = f"?{urlencode(params)}" if params else ""
        url = f"{self._config.base_url}/api/files/{file_id}/download{query}"
        return self._request("GET", url, identity=identity)

    def get_download_url(
        self, file_id: str, *, inline: bool = False, signed: bool = False
    ) -> str:
        params = {}
        if inline:
            params["inline"] = "1"
        if signed:
            params["signed"] = "1"
        query = f"?{urlencode(params)}" if params else ""
        return f"{self._config.base_url}/api/files/{file_id}/download{query}"

    # ── mutate ───────────────────────────────────────────────────────────

    def rename_file(self, file_id: str, new_name: str, **identity: Any) -> FileRecord:
        url = f"{self._config.base_url}/api/files/{file_id}/rename"
        response = self._request(
            "PATCH", url, identity=identity, json={"name": new_name}
        )
        return FileRecord.model_validate(unwrap(response)["file"])

    def update_file_metadata(
        self, file_id: str, metadata: UpdateMetadataInput, **identity: Any
    ) -> FileRecord:
        url = f"{self._config.base_url}/api/files/{file_id}"
        response = self._request(
            "PATCH", url, identity=identity, json=metadata.to_api_dict()
        )
        return FileRecord.model_validate(unwrap(response)["file"])

    def replace_file(
        self, file_id: str, file_input: UploadFileInput, **identity: Any
    ) -> FileRecord:
        url = f"{self._config.base_url}/api/files/{file_id}/replace"
        filename, content, content_type = resolve_file_input(file_input)
        response = self._request(
            "PUT",
            url,
            identity=identity,
            files={"file": (filename, content, content_type or "application/octet-stream")},
        )
        return FileRecord.model_validate(unwrap(response)["file"])

    def delete_file(self, file_id: str, **identity: Any) -> FileRecord:
        """Soft delete (sets status: 'deleted'). Requires a non-anonymous
        ``user_id``/``user_role`` — the caller must be the file's uploader
        (tenant + uploader match, enforced server-side), or pass
        user_role='admin' to delete any file in the tenant."""
        url = f"{self._config.base_url}/api/files/{file_id}"
        response = self._request("DELETE", url, identity=identity)
        return FileRecord.model_validate(unwrap(response)["file"])

    def permanent_delete_file(self, file_id: str, **identity: Any) -> None:
        """Admin-only — pass user_role='admin'. Removes both the DB record
        and the underlying cloud/disk object."""
        url = f"{self._config.base_url}/api/files/{file_id}/permanent"
        self._request("DELETE", url, identity=identity)

    def get_file_transactions(
        self, file_id: str, **identity: Any
    ) -> list[TransactionRecord]:
        """Admin-only — pass user_role='admin'."""
        url = f"{self._config.base_url}/api/files/{file_id}/transactions"
        response = self._request("GET", url, identity=identity)
        return [TransactionRecord.model_validate(item) for item in unwrap(response)]

    # ── bulk (admin-only) ───────────────────────────────────────────────

    def bulk_delete(
        self, file_ids: list[str], *, permanent: bool = False, **identity: Any
    ) -> dict[str, Any]:
        """Admin-only — pass user_role='admin'."""
        path = "permanent-delete" if permanent else "delete"
        url = f"{self._config.base_url}/api/files/bulk/{path}"
        response = self._request(
            "POST", url, identity=identity, json={"ids": file_ids}
        )
        return unwrap(response)

    def bulk_update_metadata(
        self, file_ids: list[str], updates: UpdateMetadataInput, **identity: Any
    ) -> dict[str, Any]:
        """Admin-only — pass user_role='admin'."""
        url = f"{self._config.base_url}/api/files/bulk/metadata"
        response = self._request(
            "PATCH",
            url,
            identity=identity,
            json={"ids": file_ids, "updates": updates.to_api_dict()},
        )
        return unwrap(response)

    def bulk_get_signed_urls(
        self, file_ids: list[str], *, expiry: int | None = None, **identity: Any
    ) -> dict[str, str]:
        """Admin-only — pass user_role='admin'. ``expiry`` is 60-604800 seconds."""
        url = f"{self._config.base_url}/api/files/bulk/signed-urls"
        body: dict[str, Any] = {"ids": file_ids}
        if expiry is not None:
            body["expiry"] = expiry
        response = self._request("POST", url, identity=identity, json=body)
        return unwrap(response)

    # ── presigned cloud upload ──────────────────────────────────────────

    def request_presigned_upload(
        self, request: PresignedUploadRequest, **identity: Any
    ) -> PresignedUploadResponse:
        url = f"{self._config.base_url}/api/files/upload/presign"
        response = self._request(
            "POST", url, identity=identity, json=request.to_api_dict()
        )
        return PresignedUploadResponse.model_validate(unwrap(response))

    def confirm_presigned_upload(self, file_id: str, **identity: Any) -> FileRecord:
        url = f"{self._config.base_url}/api/files/upload/presign/{file_id}/confirm"
        response = self._request("POST", url, identity=identity)
        return FileRecord.model_validate(unwrap(response))

    # ── multipart cloud upload ──────────────────────────────────────────

    def initiate_multipart_upload(
        self, request: MultipartUploadInitiateRequest, **identity: Any
    ) -> MultipartInitiateResponse:
        url = f"{self._config.base_url}/api/files/upload/multipart/initiate"
        response = self._request(
            "POST", url, identity=identity, json=request.to_api_dict()
        )
        return MultipartInitiateResponse.model_validate(unwrap(response))

    def get_multipart_part_urls(
        self, file_id: str, part_numbers: list[int], **identity: Any
    ) -> MultipartPartUrlsResponse:
        url = f"{self._config.base_url}/api/files/upload/multipart/{file_id}/parts"
        response = self._request(
            "POST", url, identity=identity, json={"partNumbers": part_numbers}
        )
        return MultipartPartUrlsResponse.model_validate(unwrap(response))

    def complete_multipart_upload(
        self, file_id: str, parts: list[MultipartPart], **identity: Any
    ) -> FileRecord:
        url = f"{self._config.base_url}/api/files/upload/multipart/{file_id}/complete"
        response = self._request(
            "POST",
            url,
            identity=identity,
            json={"parts": [p.to_api_dict() for p in parts]},
        )
        return FileRecord.model_validate(unwrap(response))

    def abort_multipart_upload(self, file_id: str, **identity: Any) -> None:
        url = f"{self._config.base_url}/api/files/upload/multipart/{file_id}/abort"
        self._request("DELETE", url, identity=identity)
