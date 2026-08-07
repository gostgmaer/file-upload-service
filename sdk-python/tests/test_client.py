from __future__ import annotations

import json

import httpx
import pytest

from file_upload_sdk import (
    AsyncFileUploadClient,
    FileUploadClient,
    NotFoundException,
    UploadFileInput,
    UploadMetadata,
)


def _envelope(data, status_code=200):
    return httpx.Response(
        status_code,
        json={
            "success": status_code < 400,
            "statusCode": status_code,
            "data": data,
            "timestamp": "2026-08-07T00:00:00.000Z",
            "requestId": "req-1",
        },
    )


def _file_record(file_id="f1", name="a.txt"):
    return {
        "id": file_id,
        "tenantId": "acme",
        "originalName": name,
        "storageKey": f"acme/{file_id}",
        "size": 3,
        "mimeType": "text/plain",
        "extension": "txt",
        "uploader": "u1",
        "category": "",
        "status": "active",
        "scanStatus": "SKIPPED",
        "url": f"/uploads/acme/{file_id}",
        "metadata": {
            "description": "",
            "tags": [],
            "custom": {},
            "title": "",
            "altText": "",
            "author": "",
            "source": "",
            "language": "",
            "expiresAt": None,
            "isPublic": False,
            "linkedTo": {},
        },
        "versions": [],
        "createdAt": "2026-08-07T00:00:00.000Z",
        "updatedAt": "2026-08-07T00:00:00.000Z",
    }


def test_upload_and_list_sync(tmp_path):
    upload_path = tmp_path / "a.txt"
    upload_path.write_bytes(b"abc")

    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        if request.url.path == "/api/files/upload":
            return _envelope([_file_record()], status_code=201)
        if request.url.path == "/api/files":
            return _envelope(
                {
                    "files": [_file_record()],
                    "pagination": {"page": 1, "limit": 20, "total": 1, "pages": 1},
                }
            )
        raise AssertionError(f"unexpected request: {request.url}")

    transport = httpx.MockTransport(handler)
    client = FileUploadClient(base_url="http://testserver", tenant_id="acme")
    client._http = httpx.Client(transport=transport)

    records = client.upload_files(
        [UploadFileInput(file=str(upload_path))],
        metadata=UploadMetadata(category="docs", tags=["a", "b"], is_public=True),
        user_id="u1",
        user_role="user",
    )
    assert len(records) == 1
    assert records[0].id == "f1"
    assert records[0].original_name == "a.txt"
    assert captured["headers"]["x-user-id"] == "u1"
    assert captured["headers"]["x-tenant-id"] == "acme"

    page = client.list_files(user_id="u1", user_role="user")
    assert page.pagination.total == 1
    assert page.files[0].id == "f1"


def test_error_mapping_sync():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            404,
            json={
                "success": False,
                "statusCode": 404,
                "message": "File not found",
                "error": {"code": "NOT_FOUND"},
                "timestamp": "2026-08-07T00:00:00.000Z",
                "requestId": "req-2",
            },
        )

    transport = httpx.MockTransport(handler)
    client = FileUploadClient(base_url="http://testserver", tenant_id="acme")
    client._http = httpx.Client(transport=transport)

    with pytest.raises(NotFoundException) as excinfo:
        client.get_file_metadata("missing")

    assert excinfo.value.status_code == 404
    assert excinfo.value.error_code == "NOT_FOUND"
    assert excinfo.value.message == "File not found"


@pytest.mark.asyncio
async def test_get_file_metadata_async():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/files/f1"
        return _envelope(_file_record())

    transport = httpx.MockTransport(handler)
    client = AsyncFileUploadClient(base_url="http://testserver", tenant_id="acme")
    client._http = httpx.AsyncClient(transport=transport)

    record = await client.get_file_metadata("f1", user_id="u1", user_role="user")
    assert record.id == "f1"
    await client.close()


def test_rename_unwraps_nested_file():
    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content) == {"name": "new.txt"}
        return _envelope({"file": _file_record(name="new.txt"), "requestId": "req-3"})

    transport = httpx.MockTransport(handler)
    client = FileUploadClient(base_url="http://testserver", tenant_id="acme")
    client._http = httpx.Client(transport=transport)

    record = client.rename_file("f1", "new.txt", user_id="u1", user_role="user")
    assert record.original_name == "new.txt"


def test_identity_is_not_read_from_env(monkeypatch):
    """tenant_id/user_id/user_role/user_email/user_name describe the current
    caller, not process-wide config — only FILE_SERVICE_URL (and the inert
    HMAC secret) should ever come from the environment."""
    monkeypatch.setenv("FILE_SERVICE_TENANT_ID", "should-not-be-used")
    monkeypatch.setenv("FILE_SERVICE_USER_ID", "should-not-be-used")
    monkeypatch.setenv("FILE_SERVICE_USER_ROLE", "should-not-be-used")
    monkeypatch.setenv("FILE_SERVICE_URL", "http://from-env:9000")

    client = FileUploadClient()
    assert client._config.base_url == "http://from-env:9000"
    assert client._config.tenant_id == "easydev"
    assert client._config.user_id == "anonymous"
    assert client._config.user_role == "anonymous"

    headers = client._headers({"user_id": "u1", "tenant_id": "acme"})
    assert headers["X-User-Id"] == "u1"
    assert headers["X-Tenant-Id"] == "acme"


def test_as_user_clones_identity():
    client = FileUploadClient(
        base_url="http://testserver", tenant_id="acme", user_id="service"
    )
    scoped = client.as_user(user_id="u1", user_role="admin")
    headers = scoped._headers({})
    assert headers["X-User-Id"] == "u1"
    assert headers["X-User-Role"] == "admin"
    assert headers["X-Tenant-Id"] == "acme"
