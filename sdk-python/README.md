# easydev-file-upload-sdk

Sync + async Python client for the multi-tenant File Upload Service, mirroring
[`@easydev_org/file-upload-sdk`](../sdk) (the Node/TS SDK) method-for-method
so both are safe to use interchangeably across services.

## Install

Not yet published to PyPI — install directly from this repo:

```bash
# uv
uv add "easydev-file-upload-sdk @ git+https://github.com/gostgmaer/file-upload-service.git#subdirectory=sdk-python"

# pip
pip install "easydev-file-upload-sdk @ git+https://github.com/gostgmaer/file-upload-service.git#subdirectory=sdk-python"
```

For local development against a checked-out copy of this repo, use a path
dependency instead (uv example):

```toml
[tool.uv.sources]
easydev-file-upload-sdk = { path = "../file-upload-service/sdk-python", editable = true }
```

## Identity model — read this before using it

The service does **not** authenticate requests to `/api/files/*` — it trusts
`X-Tenant-Id` / `X-User-Id` / `X-User-Role` / `X-User-Email` / `X-User-Name`
headers as-is (see `src/middleware/tenant.js` in this repo). Whatever identity
you send **is** the identity the operation is recorded under. Always pass the
real caller's identity — either at construction time, or per-call:

```python
from file_upload_sdk import FileUploadClient, UploadFileInput, UploadMetadata

client = FileUploadClient(base_url="http://localhost:4001", tenant_id="acme")

# Per-call identity (typical for a backend forwarding an end-user's request)
files = client.upload_files(
    [UploadFileInput(file="/path/to/report.pdf")],
    metadata=UploadMetadata(category="reports", tags=["q3"]),
    user_id="user_123",
    user_role="user",
    user_email="user@acme.com",
)

# Or clone a scoped client (nicer when making several calls as one user)
user_client = client.as_user(user_id="user_123", user_role="user")
user_client.list_files()
```

Some routes are **admin-only** (`permanent_delete_file`, `get_file_transactions`,
`bulk_delete`, `bulk_update_metadata`, `bulk_get_signed_urls` — see
`src/routes/fileRoutes.js`'s `requireAdmin` guards) and need `user_role="admin"`
on that specific call.

`delete_file` (soft delete) is different — it's **ownership-gated, not
admin-only**: any non-anonymous `user_id` can delete a file, but only if it
matches that file's uploader (tenant + uploader match, enforced server-side
by `FileService.getFileById()` — see `src/services/FileService.js`).
`user_role="admin"` bypasses the ownership check and can delete any file in
the tenant. Passing no identity (anonymous) is rejected outright.

Everything else (upload, list, get, download, rename, update, replace) is
public — no role required, the 'anonymous' default works fine.

**Nothing verifies `user_role="admin"` is a real admin, or that a given
`user_id` is who it claims to be.** `/api/files/*` is exempted from gateway
signature verification server-side (`app.js`), so both are plain, unsigned
headers the caller fully controls. Authorization for admin calls, and
attribution for ownership-gated calls like `delete_file`, has to be correct
in *your* application before you call this SDK — it and the service both
trust whatever identity you send.

## Sync usage

```python
from file_upload_sdk import FileUploadClient, UploadFileInput

with FileUploadClient(base_url="http://localhost:4001", tenant_id="acme") as client:
    [record] = client.upload_files([UploadFileInput(file="/path/to/file.pdf")])
    print(record.id, record.url)

    page = client.list_files()
    for f in page.files:
        print(f.original_name, f.size)

    response = client.download_file(record.id)
    with open("downloaded.pdf", "wb") as fh:
        fh.write(response.content)
```

## Async usage

```python
import asyncio
from file_upload_sdk import AsyncFileUploadClient, UploadFileInput

async def main():
    async with AsyncFileUploadClient(base_url="http://localhost:4001", tenant_id="acme") as client:
        [record] = await client.upload_files([UploadFileInput(file="/path/to/file.pdf")])
        page = await client.list_files()

asyncio.run(main())
```

## Configuration

Only `base_url` is a real deploy-time setting, so it's the only thing read
from the environment (`FILE_SERVICE_URL`, see `.env.example`). Identity
(`tenant_id`/`user_id`/`user_role`/`user_email`/`user_name`) describes *who
is calling right now* — there's no correct env-var default for that, so it's
never sourced from the environment. Pass it per-call or via `as_user(...)`;
anything you don't pass falls back to the literal `"anonymous"` /
`"easydev"` constants, not an env var.

`gateway_secret` (`FILE_SERVICE_HMAC_SECRET` / `GATEWAY_INTERNAL_SECRET`) is
optional and currently inert — `/api/files/*` skips gateway signature
verification server-side entirely (see `app.js`). Admin-only routes are
gated by the plain `X-User-Role: admin` header value, not by any secret.
There's nothing to keep in sync across deployments today.

## Error handling

All non-2xx responses raise `FileUploadError` (or a more specific subclass —
`BadRequestException`, `UnauthorizedException`, `ForbiddenException`,
`NotFoundException`, `ConflictException`, `RateLimitException`,
`ServerException`), each carrying `.status_code`, `.error_code`, `.details`.

```python
from file_upload_sdk import FileUploadClient, NotFoundException

try:
    client.get_file_metadata("does-not-exist")
except NotFoundException as e:
    print(e.status_code, e.message)
```

## Known API quirks (traced from this repo's own controller/service code)

- `FileRecord.url` is populated from either `url` (upload/get/rename/replace/
  confirm — routes going through `formatFile()`) or `publicUrl` (list — raw
  Mongo documents) — both are accepted transparently.
- `rename_file` / `update_file_metadata` / `replace_file` / `delete_file`
  return the file nested under `{"file": ...}` in the API response; this SDK
  unwraps it for you.
- Admin-gated routes (`permanent_delete_file`, `get_file_transactions`,
  `bulk_*`) raise `UnauthorizedException` (401) if `user_role` is left at the
  `'anonymous'` default, or `ForbiddenException` (403) if it's set to
  anything non-admin (e.g. `'user'`) — see `requireAdmin` in
  `src/middleware/rbac.js`.
- `delete_file` raises `UnauthorizedException` (401) if called anonymously,
  or `NotFoundException` (404, not 403 — the ownership check is a query
  filter, not a separate permission check) if `user_id` doesn't match the
  file's uploader and `user_role` isn't `'admin'`.
