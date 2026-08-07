from __future__ import annotations

from typing import Any


class FileUploadError(Exception):
    """Raised for any non-2xx response from the File Upload Service."""

    def __init__(
        self,
        message: str,
        status_code: int,
        error_code: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details

    def __repr__(self) -> str:
        return (
            f"{type(self).__name__}(message={self.message!r}, "
            f"status_code={self.status_code!r}, error_code={self.error_code!r})"
        )


# Alias kept for consumers written against the generic "SDKException" name.
SDKException = FileUploadError


class BadRequestException(FileUploadError):
    """400 — validation error (bad filters, malformed body, disallowed MIME type, etc.)."""

    def __init__(self, message: str = "Bad request", **kwargs: Any) -> None:
        kwargs.setdefault("status_code", 400)
        super().__init__(message, **kwargs)


class UnauthorizedException(FileUploadError):
    """401 — missing/invalid identity or gateway signature."""

    def __init__(self, message: str = "Unauthorized", **kwargs: Any) -> None:
        kwargs.setdefault("status_code", 401)
        super().__init__(message, **kwargs)


class ForbiddenException(FileUploadError):
    """403 — authenticated but not allowed (e.g. non-admin hitting an admin-only route)."""

    def __init__(self, message: str = "Forbidden", **kwargs: Any) -> None:
        kwargs.setdefault("status_code", 403)
        super().__init__(message, **kwargs)


class NotFoundException(FileUploadError):
    """404 — file or route not found."""

    def __init__(self, message: str = "Not found", **kwargs: Any) -> None:
        kwargs.setdefault("status_code", 404)
        super().__init__(message, **kwargs)


class ConflictException(FileUploadError):
    """409 — conflicting state (e.g. duplicate operation)."""

    def __init__(self, message: str = "Conflict", **kwargs: Any) -> None:
        kwargs.setdefault("status_code", 409)
        super().__init__(message, **kwargs)


class RateLimitException(FileUploadError):
    """429 — general or upload-specific rate limit exceeded."""

    def __init__(self, message: str = "Rate limit exceeded", **kwargs: Any) -> None:
        kwargs.setdefault("status_code", 429)
        super().__init__(message, **kwargs)


class ServerException(FileUploadError):
    """5xx — the service itself failed."""

    def __init__(self, message: str = "Server error", **kwargs: Any) -> None:
        kwargs.setdefault("status_code", 500)
        super().__init__(message, **kwargs)


_STATUS_EXCEPTIONS: dict[int, type[FileUploadError]] = {
    400: BadRequestException,
    401: UnauthorizedException,
    403: ForbiddenException,
    404: NotFoundException,
    409: ConflictException,
    429: RateLimitException,
}


def exception_for_status(status_code: int) -> type[FileUploadError]:
    """Map an HTTP status code to the most specific exception class available."""
    if status_code in _STATUS_EXCEPTIONS:
        return _STATUS_EXCEPTIONS[status_code]
    if status_code >= 500:
        return ServerException
    return FileUploadError
