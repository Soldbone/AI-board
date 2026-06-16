# 로컬 실행 호환용 진입점이다. `uvicorn main:app` 실행 시 실제 FastAPI 앱을 불러온다.
from backend.app.main import app
