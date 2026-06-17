from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppException(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "APP_ERROR",
        status_code: int = 400,
        details: Any | None = None,
    ) -> None:
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details


def build_error_response(
    *,
    code: str,
    message: str,
    details: Any | None = None,
) -> dict[str, Any]:
    error: dict[str, Any] = {
        "code": code,
        "message": message,
    }

    if details is not None:
        error["details"] = details

    return {"error": error}


async def app_exception_handler(
    request: Request,
    exc: AppException,
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=build_error_response(
            code=exc.code,
            message=exc.message,
            details=jsonable_encoder(exc.details),
        ),
    )


async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    code = f"HTTP_{exc.status_code}"
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    details = None if isinstance(exc.detail, str) else jsonable_encoder(exc.detail)

    return JSONResponse(
        status_code=exc.status_code,
        content=build_error_response(
            code=code,
            message=message,
            details=details,
        ),
        headers=exc.headers,
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=build_error_response(
            code="VALIDATION_ERROR",
            message="Request validation failed",
            details=jsonable_encoder(exc.errors()),
        ),
    )
