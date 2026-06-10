from fastapi import FastAPI

from app.core.config import settings
from app.core.cors import configure_cors


app = FastAPI(title=settings.app_name)
configure_cors(app, settings.backend_cors_origins)


@app.get(f"{settings.api_prefix}/health")
def health_check():
    return {"status": "ok", "service": "figure-community-api"}
