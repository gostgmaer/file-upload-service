from __future__ import annotations

import hashlib
import hmac as hmac_lib
import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Mapping
from urllib.parse import urlencode

import httpx

from .exceptions import exception_for_status
from .models import UploadFileInput

__all__ = [
    "ClientConfig",
    "resolve_config",
    "build_headers",
    "build_query_string",
    "flatten_form_fields",
    "resolve_file_input",
    "unwrap",
    "raise_for_status",
]


@dataclass
class ClientConfig:
    base_url: str
    tenant_id: str
    gateway_secret: str | None
    user_id: str
    user_role: str
    user_email: str
    user_name: str


def resolve_config(
    *,
    base_url: str | None = None,
    tenant_id: str | None = None,
    gateway_secret: str | None = None,
    user_id: str | None = None,
    user_role: str | None = None,
    user_email: str | None = None,
    user_name: str | None = None,
) -> ClientConfig:
    """Resolve client configuration.

    Only ``base_url`` (and the currently-inert ``gateway_secret`` — see
    ``build_headers()``) are genuine deploy-time settings, so only those two
    fall back to environment variables. ``tenant_id``/``user_id``/
    ``user_role``/``user_email``/``user_name`` describe *who is asking right
    now* — there's no correct process-wide default for "who is the current
    caller", so these are never read from the environment. Pass them
    per-call (``client.list_files(user_id=..., tenant_id=...)``) or via
    ``client.as_user(...)``; the constructor args below exist only for a
    service that legitimately always acts as one fixed identity (e.g. an
    admin/service-account client), not as an env-var convenience.
    """
    return ClientConfig(
        base_url=(
            base_url or os.environ.get("FILE_SERVICE_URL") or "http://localhost:4001"
        ).rstrip("/"),
        tenant_id=tenant_id or "easydev",
        # Not verified server-side today (see app.js — /api/files/* skips
        # verifyGatewaySignature entirely), so this is opt-in / future-
        # proofing, not something you need to keep in sync across deploys.
        gateway_secret=(
            gateway_secret
            or os.environ.get("FILE_SERVICE_HMAC_SECRET")
            or os.environ.get("GATEWAY_INTERNAL_SECRET")
        ),
        user_id=user_id or "anonymous",
        user_role=user_role or "anonymous",
        user_email=user_email or "",
        user_name=user_name or "",
    )


def build_headers(
    config: ClientConfig,
    *,
    user_id: str | None = None,
    user_role: str | None = None,
    user_email: str | None = None,
    user_name: str | None = None,
    tenant_id: str | None = None,
) -> dict[str, str]:
    """Build the identity + gateway-signature headers the service reads as
    trusted facts (see src/middleware/tenant.js). Whatever is sent here
    becomes `tenantId`/`uploader` on the stored file — pass the *real*
    caller's identity, not the client defaults, whenever you have it."""
    resolved_user_id = user_id or config.user_id
    resolved_user_role = user_role or config.user_role
    resolved_user_email = user_email or config.user_email
    resolved_user_name = user_name or config.user_name
    resolved_tenant_id = tenant_id or config.tenant_id

    headers = {
        "X-Tenant-Id": resolved_tenant_id,
        "X-User-Id": resolved_user_id,
        "X-User-Role": resolved_user_role,
    }
    if resolved_user_email:
        headers["X-User-Email"] = resolved_user_email
    if resolved_user_name:
        headers["X-User-Name"] = resolved_user_name

    if config.gateway_secret:
        payload = f"{resolved_user_id}:{resolved_user_email}:{resolved_user_role}"
        headers["X-Gateway-HMAC"] = hmac_lib.new(
            config.gateway_secret.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    return headers


def build_query_string(filters: Mapping[str, Any] | None) -> str:
    if not filters:
        return ""
    params: list[tuple[str, str]] = []
    for key, value in filters.items():
        if value is None or value == "":
            continue
        if key == "tags":
            values = value if isinstance(value, (list, tuple)) else [value]
            params.extend(("tags", str(v)) for v in values)
        elif isinstance(value, bool):
            params.append((key, "true" if value else "false"))
        elif isinstance(value, datetime):
            params.append((key, value.isoformat()))
        else:
            params.append((key, str(value)))
    if not params:
        return ""
    return f"?{urlencode(params)}"


def flatten_form_fields(fields: Mapping[str, Any]) -> dict[str, Any]:
    """Serialize an already-camelCased field dict (e.g. from
    UploadMetadata.to_api_dict()) into multipart/form-data-safe values —
    matches the Node SDK's appendMetadataToFormData."""
    out: dict[str, Any] = {}
    for key, value in fields.items():
        if value is None:
            continue
        if key == "custom" and isinstance(value, Mapping):
            out[key] = json.dumps(value)
        elif isinstance(value, bool):
            out[key] = "true" if value else "false"
        elif isinstance(value, datetime):
            out[key] = value.isoformat()
        elif isinstance(value, list):
            out[key] = [str(v) for v in value]
        else:
            out[key] = str(value)
    return out


def resolve_file_input(file_input: UploadFileInput) -> tuple[str, bytes, str | None]:
    """Read a file input into (filename, content_bytes, content_type)."""
    file = file_input.file

    if isinstance(file, str):
        filename = file_input.filename or os.path.basename(file)
        with open(file, "rb") as fh:
            content = fh.read()
        return filename, content, file_input.content_type

    if isinstance(file, (bytes, bytearray)):
        filename = file_input.filename or "file.bin"
        return filename, bytes(file), file_input.content_type

    if hasattr(file, "read"):
        filename = (
            file_input.filename
            or os.path.basename(getattr(file, "name", "") or "")
            or "file.bin"
        )
        content = file.read()
        if isinstance(content, str):
            content = content.encode("utf-8")
        return filename, content, file_input.content_type

    raise TypeError(f"Unsupported file input type: {type(file)!r}")


def raise_for_status(response: httpx.Response) -> None:
    if response.status_code < 400:
        return

    try:
        body = response.json()
    except ValueError:
        raise exception_for_status(response.status_code)(
            f"HTTP Error {response.status_code}: {response.reason_phrase}",
            status_code=response.status_code,
        ) from None

    message = f"HTTP Error {response.status_code}"
    code = None
    details = None
    if isinstance(body, Mapping):
        message = body.get("message") or message
        error = body.get("error")
        if isinstance(error, Mapping):
            code = error.get("code")
            details = error.get("errors")

    raise exception_for_status(response.status_code)(
        message, status_code=response.status_code, error_code=code, details=details
    )


def unwrap(response: httpx.Response) -> Any:
    """Every response wraps its real payload in a `{success, data, ...}`
    envelope (see app.js's response envelope middleware) — pulls `data`
    back out so callers can validate it directly."""
    body = response.json()
    if isinstance(body, Mapping) and "data" in body:
        return body["data"]
    return body
