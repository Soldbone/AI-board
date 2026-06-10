from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.cors import configure_cors
from app.core.exceptions import (
    AppException,
    app_exception_handler,
    http_exception_handler,
    validation_exception_handler,
)


app = FastAPI(title=settings.app_name)
configure_cors(app, settings.backend_cors_origins)
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)


@app.get(f"{settings.api_prefix}/health")
def health_check():
    return {"status": "ok", "service": "figure-community-api"}
