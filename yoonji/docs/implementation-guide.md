# 구현 설명서

이 문서는 프로젝트를 phase별로 구현하면서 작성한 코드의 의미를 설명하는 학습용 기록이다.  
새 phase를 구현할 때마다 같은 파일 아래에 섹션을 추가한다.

## Phase 0. 프로젝트 실행 뼈대

### 1. 이번 Phase의 목표

Phase 0의 목표는 게시판, DB, AI 기능을 아직 붙이지 않고도 프론트엔드와 백엔드가 각각 실행되는 최소 상태를 만드는 것이다.

이번 phase에서 확인하는 것은 단 하나다.

```txt
React 화면에서 FastAPI health check API를 호출할 수 있는가?
```

이 연결이 되면 이후 phase에서 회원가입, 게시글, 댓글 같은 기능을 붙일 준비가 된다.

### 2. 수정한 파일 목록

백엔드:

- `backend/app/main.py`
- `backend/app/core/config.py`
- `backend/app/core/cors.py`

프론트엔드:

- `frontend/src/api/axiosInstance.js`
- `frontend/src/api/client.js`
- `frontend/src/App.jsx`
- `frontend/src/App.css`
- `frontend/src/index.css`
- `frontend/index.html`

문서:

- `docs/implementation-guide.md`

프로젝트 설정:

- `.gitignore`

### 3. 백엔드 코드 설명

#### `backend/app/core/config.py`

이 파일은 백엔드 앱에서 사용할 기본 설정을 모아두는 곳이다.

현재 관리하는 값은 세 가지다.

- `app_name`: FastAPI 앱 이름
- `api_prefix`: API 공통 prefix
- `backend_cors_origins`: 프론트엔드 접근을 허용할 origin 목록

코드에서는 `python-dotenv`의 `load_dotenv()`를 호출한다. 이 함수는 `backend/.env` 파일에 적힌 값을 환경변수처럼 읽을 수 있게 해준다.

```py
load_dotenv()
```

`Settings` 클래스는 환경변수가 있으면 그 값을 사용하고, 없으면 기본값을 사용한다.

```py
self.app_name = os.getenv("APP_NAME", "Figure Community API")
self.api_prefix = os.getenv("API_PREFIX", "/api/v1")
```

즉 `backend/.env`가 비어 있어도 앱은 실행된다.

`BACKEND_CORS_ORIGINS`는 쉼표로 여러 origin을 적을 수 있게 했다.

```txt
BACKEND_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

`_parse_origins()`는 이 문자열을 리스트로 바꾼다.

```py
["http://localhost:5173", "http://127.0.0.1:5173"]
```

`@lru_cache`는 설정 객체를 매번 새로 만들지 않고 한 번 만든 값을 재사용하게 해준다.

#### `backend/app/core/cors.py`

이 파일은 CORS 설정만 담당한다.

CORS는 브라우저가 `localhost:5173`의 React 앱에서 `localhost:8000`의 FastAPI 서버로 요청을 보낼 수 있게 허용하는 설정이다.

```py
def configure_cors(app: FastAPI, allowed_origins: list[str]) -> None:
```

이 함수는 FastAPI 앱과 허용할 origin 목록을 받아서 `CORSMiddleware`를 추가한다.

현재 설정은 다음과 같다.

- `allow_origins`: 요청을 허용할 프론트 주소
- `allow_credentials`: 쿠키나 인증 헤더 허용
- `allow_methods`: 모든 HTTP method 허용
- `allow_headers`: 모든 요청 header 허용

Phase 0에서는 개발 편의상 method와 header를 모두 허용한다.

#### `backend/app/main.py`

이 파일은 FastAPI 앱의 시작점이다.

```py
app = FastAPI(title=settings.app_name)
```

`settings.app_name`을 사용해서 앱 이름을 설정한다.

```py
configure_cors(app, settings.backend_cors_origins)
```

위 코드는 `cors.py`에 분리해둔 CORS 설정을 앱에 적용한다.

Phase 0에서 실제로 제공하는 API는 health check 하나다.

```py
@app.get(f"{settings.api_prefix}/health")
def health_check():
    return {"status": "ok", "service": "figure-community-api"}
```

`settings.api_prefix`의 기본값이 `/api/v1`이므로 실제 주소는 아래와 같다.

```txt
GET /api/v1/health
```

응답은 고정이다.

```json
{
  "status": "ok",
  "service": "figure-community-api"
}
```

이 API는 백엔드 서버가 살아 있고 프론트에서 호출 가능한지 확인하기 위한 최소 endpoint다.

### 4. 프론트엔드 코드 설명

#### `frontend/src/api/axiosInstance.js`

이 파일은 모든 API 요청에서 함께 사용할 axios 인스턴스를 만든다.

```js
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
```

`VITE_API_BASE_URL`은 `frontend/.env`에 적힌 값이다.

```txt
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

환경변수가 없으면 기본값으로 `http://localhost:8000/api/v1`을 사용한다.

```js
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
});
```

이렇게 만들어두면 API를 호출할 때 매번 전체 URL을 쓰지 않아도 된다.

예를 들어 아래 요청은:

```js
axiosInstance.get("/health")
```

실제로는 아래 주소로 요청된다.

```txt
http://localhost:8000/api/v1/health
```

request interceptor에서는 localStorage에 `access_token`이 있으면 Authorization header를 자동으로 붙인다.

```js
config.headers.Authorization = `Bearer ${token}`;
```

Phase 0에는 로그인 기능이 없지만, Phase 3에서 JWT 로그인을 구현할 때 이 구조를 그대로 사용할 수 있다.

#### `frontend/src/api/client.js`

이 파일은 Phase 0에서 실제로 호출하는 API 함수를 담는다.

```js
export async function healthCheck() {
  const response = await axiosInstance.get("/health");
  return response.data;
}
```

`App.jsx`는 axios를 직접 알 필요 없이 `healthCheck()`만 호출하면 된다.

이렇게 분리하면 이후에도 화면 컴포넌트는 API 주소나 axios 설정을 몰라도 된다.

#### `frontend/src/App.jsx`

이 파일은 Phase 0의 메인 화면이다.

화면은 세 가지 상태를 가진다.

- `loading`: health check 요청 중
- `connected`: 백엔드 연결 성공
- `failed`: 백엔드 연결 실패

```js
const [connectionStatus, setConnectionStatus] = useState("loading");
```

컴포넌트가 처음 렌더링되면 `useEffect()` 안에서 백엔드 health check를 호출한다.

```js
useEffect(() => {
  async function checkBackendConnection() {
    const data = await healthCheck();
  }
}, []);
```

성공하면:

```js
setConnectionStatus("connected");
setHealthResponse(data);
```

실패하면:

```js
setConnectionStatus("failed");
setErrorMessage(error.message);
```

`ignore` 변수는 컴포넌트가 사라진 뒤 비동기 요청이 늦게 끝났을 때 state를 바꾸지 않도록 막는 안전장치다.

화면에는 아래 정보가 표시된다.

- 앱 이름
- Phase 이름
- API base URL
- health check 상태
- 성공 시 백엔드 응답 JSON
- 실패 시 에러 메시지

#### `frontend/src/App.css`

이 파일은 Phase 0 화면 전용 스타일이다.

주요 class:

- `.app-shell`: 화면 전체 배경과 중앙 정렬
- `.status-panel`: 상태를 보여주는 흰색 패널
- `.phase-label`: Phase 0 배지
- `.status-list`: API URL과 연결 상태 목록
- `.status-pill`: `loading`, `connected`, `failed` 상태 표시
- `.response-box`: 성공 시 JSON 응답 표시
- `.error-text`: 실패 메시지 표시

상태별 색은 다음과 같이 구분한다.

- `loading`: 노란색 계열
- `connected`: 초록색 계열
- `failed`: 빨간색 계열

#### `frontend/src/index.css`

이 파일은 앱 전체에 적용되는 기본 스타일이다.

Vite 기본 샘플 스타일을 제거하고 아래만 남겼다.

- 기본 font
- body margin 제거
- box sizing 통일
- form element font 상속

이렇게 해두면 이후 화면을 만들 때 예상치 못한 Vite 샘플 스타일의 영향을 받지 않는다.

#### `frontend/index.html`

브라우저 탭 제목을 `Figure Community`로 변경했다.

```html
<title>Figure Community</title>
```

#### `.gitignore`

Phase 0 검증 중 생기는 개발 산출물이 Git에 섞이지 않도록 기본 ignore 규칙을 추가했다.

주요 대상:

- `.env`: 실제 환경변수 파일
- `backend/.env`, `frontend/.env`: 로컬 환경변수
- `backend/.venv/`: Python 가상환경
- `frontend/node_modules/`: Node 의존성
- `frontend/dist/`: Vite build 결과물
- `__pycache__/`: Python 실행 캐시

`.env.example`은 공유용 예시 파일이므로 무시하지 않는다.

### 5. 프론트와 백엔드가 연결되는 흐름

Phase 0의 연결 흐름은 다음과 같다.

```txt
사용자가 React 화면 접속
→ App.jsx 렌더링
→ useEffect 실행
→ healthCheck() 호출
→ axiosInstance.get("/health")
→ http://localhost:8000/api/v1/health 요청
→ FastAPI health_check() 실행
→ {"status": "ok", "service": "figure-community-api"} 반환
→ React 화면에 connected 표시
```

프론트가 호출하는 코드는 `/health`지만, axios의 `baseURL` 때문에 실제 요청은 `/api/v1/health`가 된다.

### 6. 실행 방법

백엔드 실행:

```bash
cd backend
python -m uvicorn app.main:app --reload
```

프론트엔드 실행:

```bash
cd frontend
npm run dev
```

브라우저 접속:

```txt
http://localhost:5173
```

### 7. 확인 방법

백엔드만 확인:

```txt
http://localhost:8000/api/v1/health
```

기대 응답:

```json
{
  "status": "ok",
  "service": "figure-community-api"
}
```

프론트 화면 확인:

- 백엔드가 켜져 있으면 `connected`가 표시된다.
- 백엔드가 꺼져 있으면 `failed`가 표시된다.
- `API base URL`이 `http://localhost:8000/api/v1`로 표시된다.

### 8. 다음 Phase로 넘어가기 전에 이해해야 할 것

다음 phase로 가기 전에 아래 내용을 이해하면 좋다.

- FastAPI 앱은 `backend/app/main.py`에서 시작된다.
- React 앱은 `frontend/src/main.jsx`에서 시작된다.
- `App.jsx`는 지금은 연결 확인 화면 역할만 한다.
- API 호출 설정은 `axiosInstance.js`에 모아둔다.
- 실제 API 함수는 `client.js` 같은 파일에 둔다.
- CORS 설정이 없으면 브라우저가 프론트에서 백엔드로 보내는 요청을 막을 수 있다.
- Phase 0에는 DB, 인증, 게시판, AI가 전혀 없다.

## Phase 1. Alembic 없는 DB 기반

### 1. 이번 Phase의 목표

Phase 1의 목표는 FastAPI 백엔드에서 PostgreSQL을 사용할 수 있는 최소 기반을 만드는 것이다.

이번 Phase에서는 아직 게시글, 회원, 이미지, 댓글 같은 실제 기능을 만들지 않는다. 대신 나중에 그런 기능을 만들 때 공통으로 사용할 DB 연결 구조를 먼저 준비한다.

핵심 흐름은 다음과 같다.

```txt
FastAPI route
-> Depends(get_db)
-> SQLAlchemy Session
-> PostgreSQL
```

혼자 진행하는 MVP 프로젝트라서 Alembic은 사용하지 않는다. 대신 이후 모델이 생기면 SQLAlchemy의 `Base.metadata.create_all()`을 이용해서 테이블을 생성할 수 있도록 준비했다.

### 2. 수정한 파일 목록

백엔드 설정:

- `backend/app/core/config.py`
- `backend/app/core/exceptions.py`
- `backend/app/main.py`

DB 기반:

- `backend/app/db/base.py`
- `backend/app/db/database.py`
- `backend/app/db/session.py`
- `backend/app/db/init_db.py`

API dependency:

- `backend/app/api/deps.py`

문서:

- `docs/implementation-guide.md`

### 3. `backend/app/core/config.py`

이 파일은 백엔드 전체 설정을 모아두는 곳이다.

Phase 1에서는 `database_url` 설정을 추가했다.

```py
self.database_url = os.getenv(
    "DATABASE_URL",
    "postgresql://figure_user:figure_password@localhost:5432/figure_community",
)
```

이 코드는 먼저 `.env` 파일의 `DATABASE_URL` 값을 찾는다.

예를 들어 현재 프로젝트의 `backend/.env`에는 다음과 같은 값이 들어갈 수 있다.

```env
DATABASE_URL=postgresql://figure_user:figure_password@localhost:5432/figure_community
```

값을 해석하면 다음과 같다.

```txt
postgresql://아이디:비밀번호@호스트:포트/DB이름
```

즉 현재 기본값은 아래 의미를 가진다.

- DB 종류: PostgreSQL
- 사용자 이름: `figure_user`
- 비밀번호: `figure_password`
- DB 주소: `localhost`
- DB 포트: `5432`
- DB 이름: `figure_community`

`.env`에 `DATABASE_URL`이 없어도 같은 기본값으로 실행되게 해두었다.

### 4. `backend/app/db/base.py`

이 파일은 SQLAlchemy 모델들이 상속할 공통 `Base`를 정의한다.

```py
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

앞으로 `User`, `Post`, `Comment` 같은 모델을 만들 때는 이 `Base`를 상속한다.

예를 들면 이후 Phase에서는 이런 형태가 된다.

```py
class Post(Base):
    __tablename__ = "posts"
```

SQLAlchemy는 `Base`를 기준으로 어떤 모델들이 테이블인지 추적한다.

그래서 나중에 `Base.metadata.create_all(bind=engine)`을 호출하면 `Base`를 상속한 모델들을 보고 DB에 테이블을 만들 수 있다.

### 5. `backend/app/db/database.py`

이 파일은 실제 DB 연결의 중심이다.

```py
engine = create_engine(settings.database_url, pool_pre_ping=True)
```

`engine`은 Python 코드와 PostgreSQL 사이의 연결 관리자라고 보면 된다.

`settings.database_url`을 사용하기 때문에 DB 접속 정보는 코드에 직접 박혀 있지 않고 `.env`에서 바꿀 수 있다.

`pool_pre_ping=True`는 DB 연결을 사용하기 전에 연결이 살아 있는지 가볍게 확인하는 옵션이다. 오래된 연결 때문에 갑자기 요청이 실패하는 일을 줄여준다.

```py
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)
```

`SessionLocal`은 DB session을 만들어내는 공장이다.

여기서 session은 하나의 DB 작업 단위라고 이해하면 된다. API 요청이 들어오면 session을 하나 열고, 필요한 DB 작업을 한 뒤, 요청이 끝나면 session을 닫는다.

설정 의미는 다음과 같다.

- `autocommit=False`: 자동 commit을 하지 않는다. 데이터 저장 시 명시적으로 commit해야 한다.
- `autoflush=False`: SQLAlchemy가 임의 시점에 변경사항을 DB에 밀어 넣는 동작을 줄인다.
- `bind=engine`: 이 session이 어떤 DB engine을 사용할지 지정한다.

### 6. `backend/app/db/session.py`

이 파일은 FastAPI route에서 사용할 DB session dependency를 정의한다.

```py
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
```

FastAPI에서는 `yield`를 사용하는 dependency를 만들 수 있다.

동작 흐름은 다음과 같다.

```txt
1. API 요청이 들어온다.
2. get_db()가 SessionLocal()로 DB session을 만든다.
3. route 함수에 session을 넘겨준다.
4. route 처리가 끝난다.
5. finally에서 db.close()로 session을 닫는다.
```

이 구조 덕분에 각 API는 DB session을 직접 만들고 닫는 일을 반복하지 않아도 된다.

### 7. `backend/app/api/deps.py`

이 파일은 API route에서 자주 쓰는 dependency를 한 곳에 모으기 위한 파일이다.

```py
DbSession = Annotated[Session, Depends(get_db)]
```

나중에 route를 만들 때는 다음처럼 쓸 수 있다.

```py
@router.get("/posts")
def list_posts(db: DbSession):
    ...
```

이렇게 하면 `db`에는 SQLAlchemy session이 자동으로 들어온다.

즉 route 코드는 `SessionLocal()`을 직접 알 필요가 없다.

### 8. `backend/app/db/init_db.py`

Alembic을 쓰지 않기로 했기 때문에, 테이블을 생성할 수 있는 최소 함수만 준비했다.

```py
def init_db() -> None:
    Base.metadata.create_all(bind=engine)
```

`Base.metadata.create_all()`은 `Base`를 상속한 모든 모델을 확인하고, DB에 아직 없는 테이블을 생성한다.

단, Phase 1에서는 아직 모델을 만들지 않았기 때문에 이 함수를 실행해도 생성되는 테이블은 없다.

이 파일을 바로 앱 시작 시 자동 실행하지 않은 이유는 다음과 같다.

- Phase 1에는 아직 실제 모델이 없다.
- DB가 실행 중이지 않아도 Phase 0 health check는 계속 확인할 수 있어야 한다.
- 테이블 생성 시점은 Phase 2에서 모델을 만든 뒤 정하는 편이 더 명확하다.

### 9. `backend/app/core/exceptions.py`

이 파일은 백엔드의 에러 응답 형태를 통일하기 위해 만들었다.

공통 에러 응답 형태는 다음과 같다.

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "error message",
    "details": {}
  }
}
```

`AppException`은 프로젝트 내부에서 직접 사용할 커스텀 예외다.

```py
raise AppException(
    "Post not found",
    code="POST_NOT_FOUND",
    status_code=404,
)
```

이렇게 예외를 던지면 FastAPI가 JSON 응답으로 변환한다.

`http_exception_handler()`는 FastAPI 또는 Starlette에서 발생하는 일반 HTTP 예외를 같은 응답 구조로 바꾼다.

`validation_exception_handler()`는 요청 body, query parameter 등이 잘못되었을 때 발생하는 validation error를 같은 응답 구조로 바꾼다.

### 10. `backend/app/main.py`

`main.py`에는 Phase 1에서 만든 예외 핸들러를 등록했다.

```py
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
```

이 코드는 FastAPI 앱 전체에 예외 처리 규칙을 연결한다.

즉 이후 어떤 route에서 `AppException`이 발생하더라도 같은 JSON 구조로 응답할 수 있다.

기존 Phase 0 health check는 그대로 유지했다.

```py
@app.get(f"{settings.api_prefix}/health")
def health_check():
    return {"status": "ok", "service": "figure-community-api"}
```

### 11. DB session이 API에 들어가는 흐름

나중에 게시글 목록 API를 만든다고 가정하면 흐름은 다음과 같다.

```txt
사용자가 GET /api/v1/posts 요청
-> FastAPI가 route 함수 실행 준비
-> Depends(get_db)가 DB session 생성
-> route 함수의 db 파라미터에 session 전달
-> service/repository에서 db로 DB 조회
-> 응답 반환
-> get_db()의 finally에서 db.close()
```

Phase 1은 이 흐름 중 `Depends(get_db)`까지 사용할 수 있게 만든 것이다.

### 12. Alembic을 쓰지 않는다는 의미

Alembic은 DB 테이블 변경 이력을 관리하는 도구다.

현업이나 팀 프로젝트에서는 매우 유용하지만, 혼자 만드는 MVP 초기 단계에서는 학습할 것이 많아지고 파일도 늘어난다.

그래서 이 프로젝트에서는 우선 Alembic 없이 간단하게 간다.

대신 주의할 점은 있다.

- 테이블 구조가 바뀌면 자동 migration 파일이 생기지 않는다.
- 개발 중에는 DB를 직접 초기화하거나 수동 SQL을 작성해야 할 수 있다.
- 배포나 협업 단계로 가면 Alembic 도입을 다시 고려하는 것이 좋다.

MVP 학습 단계에서는 구조를 먼저 이해하는 것이 더 중요하므로, 지금은 SQLAlchemy 기본 흐름에 집중한다.

### 13. 실행 방법

백엔드 실행:

```bash
cd backend
python -m uvicorn app.main:app --reload
```

health check 확인:

```txt
http://localhost:8000/api/v1/health
```

기대 응답:

```json
{
  "status": "ok",
  "service": "figure-community-api"
}
```

### 14. 확인 방법

Python 문법 확인:

```bash
cd backend
python -m py_compile app/main.py app/core/config.py app/core/exceptions.py app/db/base.py app/db/database.py app/db/session.py app/db/init_db.py app/api/deps.py
```

DB가 켜져 있다면 session 연결도 확인할 수 있다.

```bash
cd backend
python -c "from sqlalchemy import text; from app.db.database import SessionLocal; db = SessionLocal(); print(db.execute(text('SELECT 1')).scalar()); db.close()"
```

정상이라면 `1`이 출력된다.

### 15. 다음 Phase로 넘어가기 전에 이해해야 할 것

Phase 2로 넘어가기 전에 아래 개념을 이해하면 좋다.

- `Base`는 SQLAlchemy 모델들의 공통 부모다.
- `engine`은 DB 연결 관리자다.
- `SessionLocal`은 DB session을 만드는 공장이다.
- `get_db()`는 요청마다 session을 열고 닫는 FastAPI dependency다.
- route에서는 `DbSession` 타입을 사용해서 DB session을 자동으로 받을 수 있다.
- Alembic을 쓰지 않으므로 테이블 생성은 `create_all()` 기반으로 진행한다.

## Phase 2. 게시판 MVP 핵심 DB 모델

### 1. 이번 Phase의 목표

Phase 2의 목표는 게시판 MVP에 필요한 핵심 DB 테이블을 SQLAlchemy 모델로 정의하는 것이다.

이번 Phase에서는 API를 만들지 않는다. 즉 회원가입, 로그인, 게시글 작성, 댓글 작성 같은 기능은 아직 동작하지 않는다. 대신 이후 Phase에서 API를 만들 때 사용할 DB 구조를 먼저 완성했다.

이번 Phase에서 만든 핵심 모델은 9개다.

- `User`
- `AuthSession`
- `Board`
- `Post`
- `PostFigureInfo`
- `Comment`
- `Tag`
- `PostTag`
- `PostImage`

AI, MCP, 신고 기능에 필요한 모델 파일은 아직 비워두었다. MVP가 AI 없는 게시판 기본 구현이기 때문이다.

### 2. 수정한 파일 목록

모델:

- `backend/app/models/enums.py`
- `backend/app/models/user.py`
- `backend/app/models/auth_session.py`
- `backend/app/models/board.py`
- `backend/app/models/post.py`
- `backend/app/models/post_figure_info.py`
- `backend/app/models/comment.py`
- `backend/app/models/tag.py`
- `backend/app/models/post_tag.py`
- `backend/app/models/post_image.py`
- `backend/app/models/__init__.py`

DB 초기화:

- `backend/app/db/init_db.py`

Seed 스크립트:

- `scripts/seed_boards.py`

문서:

- `docs/implementation-guide.md`

### 3. SQLAlchemy 2.0 스타일

이번 Phase의 모델은 SQLAlchemy 2.0 스타일로 작성했다.

대표 형태는 다음과 같다.

```py
id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
```

여기서 의미는 다음과 같다.

- `Mapped[int]`: 이 필드는 Python 코드에서 `int`로 다룬다는 뜻이다.
- `mapped_column(...)`: 이 필드가 실제 DB 컬럼이라는 뜻이다.
- `BigInteger`: DB에서는 큰 정수 타입으로 저장한다.
- `primary_key=True`: 테이블의 기본 키다.
- `index=True`: 조회 성능을 위해 인덱스를 만든다.

Phase 2에서는 ERD 설계안의 `bigint` 기준에 맞춰 주요 `id`, `foreign key`를 `BigInteger`로 만들었다.

### 4. `backend/app/models/enums.py`

이 파일은 DB에 저장할 상태값들을 한 곳에 모아둔다.

예를 들어 게시글 상태는 다음처럼 정의했다.

```py
class PostStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    PENDING_REVIEW = "PENDING_REVIEW"
    HIDDEN = "HIDDEN"
    DELETED = "DELETED"
```

이렇게 enum으로 관리하면 코드에서 오타를 줄일 수 있다.

예를 들어 문자열을 직접 쓰면 다음처럼 실수할 수 있다.

```py
post.status = "PUBLISHD"
```

하지만 enum을 쓰면 정해진 값만 사용하게 된다.

```py
post.status = PostStatus.PUBLISHED
```

`enum_column_type()` 함수도 이 파일에 있다.

```py
def enum_column_type(enum_class: type[Enum], name: str) -> SQLAlchemyEnum:
    return SQLAlchemyEnum(
        enum_class,
        name=name,
        native_enum=False,
        validate_strings=True,
        values_callable=lambda values: [item.value for item in values],
    )
```

중요한 설정은 `native_enum=False`다.

PostgreSQL에는 native enum이라는 기능이 있지만, Alembic 없이 enum 값을 바꾸려면 번거롭다. 그래서 MVP 단계에서는 DB에 문자열처럼 저장하고, Python 코드에서 enum으로 검증하는 방식을 선택했다.

`values_callable`은 enum의 이름이 아니라 실제 값을 저장하게 해준다.

예를 들어 `PriceRange.PRICE_30000_50000`의 Python 이름은 `PRICE_30000_50000`이지만 API/DB에서 원하는 값은 `30000_50000`이다. 이 설정 덕분에 DB에는 `30000_50000`이 저장된다.

### 5. `User` 모델

파일:

- `backend/app/models/user.py`

테이블:

```txt
users
```

`User`는 회원 정보를 저장한다.

핵심 필드는 다음과 같다.

- `email`: 이메일, 중복 불가
- `login_id`: 로그인 ID, 중복 불가
- `password_hash`: 해시된 비밀번호
- `nickname`: 닉네임
- `profile_image_url`: 프로필 이미지 주소
- `role`: `USER`, `ADMIN`
- `status`: `ACTIVE`, `INACTIVE`, `SUSPENDED`, `DELETED`
- `last_login_at`: 마지막 로그인 시각

관계는 다음과 같다.

```txt
User 1:N AuthSession
User 1:N Post
User 1:N Comment
User 1:N PostImage
```

즉 한 사용자는 여러 로그인 세션, 여러 게시글, 여러 댓글, 여러 이미지를 가질 수 있다.

### 6. `AuthSession` 모델

파일:

- `backend/app/models/auth_session.py`

테이블:

```txt
auth_sessions
```

`AuthSession`은 로그인 유지에 사용할 refresh token 정보를 저장한다.

핵심 필드는 다음과 같다.

- `user_id`: 어떤 사용자의 세션인지
- `refresh_token_hash`: refresh token 원문이 아니라 해시값
- `expires_at`: 만료 시각
- `revoked_at`: 로그아웃 등으로 폐기된 시각
- `created_at`: 생성 시각

비밀번호와 마찬가지로 refresh token도 원문 그대로 DB에 저장하지 않는 편이 좋다. 그래서 `refresh_token_hash`라는 이름으로 만들었다.

### 7. `Board` 모델

파일:

- `backend/app/models/board.py`

테이블:

```txt
boards
```

`Board`는 게시판 종류를 저장한다.

이번 MVP seed에서 실제로 만드는 게시판은 4개다.

- `REVIEW`
- `INFO`
- `QUESTION`
- `PURCHASE_HELP`

`NOTICE`, `FAQ`는 enum 값으로는 남겨두었지만 기본 seed 데이터에서는 제외했다. 나중에 운영자 기능이 필요해지면 추가할 수 있다.

핵심 필드는 다음과 같다.

- `code`: 게시판 코드
- `name`: 화면에 보여줄 게시판 이름
- `description`: 설명
- `sort_order`: 정렬 순서
- `is_active`: 사용 여부

관계는 다음과 같다.

```txt
Board 1:N Post
```

하나의 게시판에는 여러 게시글이 들어간다.

### 8. `Post` 모델

파일:

- `backend/app/models/post.py`

테이블:

```txt
posts
```

`Post`는 게시글의 중심 테이블이다.

후기, 정보글, 질문글, 구매 고민 글은 모두 `posts` 테이블에 저장하고, 어떤 게시판 글인지는 `board_id`로 구분한다.

핵심 필드는 다음과 같다.

- `board_id`: 어느 게시판의 글인지
- `author_id`: 작성자
- `title`: 제목
- `content`: 본문
- `source_type`: `USER`, `AI_DRAFT`, `AI_PUBLISHED`
- `status`: `DRAFT`, `PUBLISHED`, `PENDING_REVIEW`, `HIDDEN`, `DELETED`
- `view_count`: 조회수
- `comment_count`: 댓글 수
- `published_at`: 게시 시각
- `deleted_at`: 삭제 시각

`deleted_at`을 둔 이유는 soft delete 때문이다.

soft delete는 데이터를 실제로 삭제하지 않고, 삭제된 것처럼 표시하는 방식이다.

```txt
status = DELETED
deleted_at = 삭제 시각
```

이렇게 하면 나중에 운영자 확인, 복구, 로그 분석이 가능하다.

관계는 다음과 같다.

```txt
Post N:1 Board
Post N:1 User
Post 1:N PostFigureInfo
Post 1:N Comment
Post 1:N PostImage
Post 1:N PostTag
```

### 9. `PostFigureInfo` 모델

파일:

- `backend/app/models/post_figure_info.py`

테이블:

```txt
post_figure_infos
```

`PostFigureInfo`는 후기 게시판에서 사용하는 피규어 정보를 저장한다.

구매 고민 게시판은 `PostFigureInfo`를 사용하지 않는다. 구매 고민 글에서는 고민 중인 대상, 예상 가격, 고민 이유를 제목과 본문에 작성한다.

API에서는 다음 이름을 사용한다.

```json
{
  "figure_name": "하츠네 미쿠",
  "manufacturer": "Good Smile Company"
}
```

하지만 DB 컬럼은 다음 이름으로 만들었다.

```txt
figure_name_text
manufacturer_text
```

이렇게 한 이유는 나중에 별도의 `Figure` 마스터 테이블을 만들 가능성이 있기 때문이다. 지금은 사용자가 입력한 텍스트라는 의미가 분명하도록 `_text`를 붙였다.

핵심 필드는 다음과 같다.

- `figure_name_text`: 피규어 이름 텍스트
- `manufacturer_text`: 제조사 텍스트
- `figure_type`: 피규어 종류
- `price_amount`: 가격
- `price_range`: 가격대
- `purchase_date`: 구매일
- `satisfaction_score`: 만족도
- `target_type`: 후기 대상인지, 관련 피규어 정보인지

### 10. `Comment` 모델

파일:

- `backend/app/models/comment.py`

테이블:

```txt
comments
```

`Comment`는 게시글에 달리는 댓글이다.

MVP에서는 대댓글을 만들지 않으므로 `parent_comment_id` 같은 필드는 두지 않았다.

핵심 필드는 다음과 같다.

- `post_id`: 댓글이 달린 게시글
- `author_id`: 댓글 작성자
- `content`: 댓글 내용
- `status`: `PUBLISHED`, `HIDDEN`, `DELETED`
- `deleted_at`: 댓글 삭제 시각

댓글도 soft delete 구조다.

### 11. `Tag`와 `PostTag` 모델

파일:

- `backend/app/models/tag.py`
- `backend/app/models/post_tag.py`

테이블:

```txt
tags
post_tags
```

게시글과 태그는 다대다 관계다.

```txt
하나의 게시글은 여러 태그를 가질 수 있다.
하나의 태그는 여러 게시글에 사용될 수 있다.
```

그래서 중간 연결 테이블인 `post_tags`를 둔다.

```txt
Post N:M Tag
Post 1:N PostTag
Tag 1:N PostTag
```

`PostTag`는 별도의 `id`를 두지 않았다. 대신 `post_id`, `tag_id`를 함께 primary key로 사용한다.

```py
post_id: Mapped[int] = mapped_column(..., primary_key=True)
tag_id: Mapped[int] = mapped_column(..., primary_key=True)
```

이렇게 하면 같은 게시글에 같은 태그가 중복 연결되는 것을 막을 수 있다.

`Tag`에는 다음 unique constraint도 추가했다.

```py
UniqueConstraint("normalized_name", "tag_type", name="uq_tags_normalized_type")
```

이 제약은 같은 유형 안에서 정규화된 태그명이 중복되지 않게 한다.

예를 들어 `하츠네 미쿠`, `하츠네미쿠`를 같은 값으로 정규화하면 중복 태그 생성을 줄일 수 있다.

### 12. `PostImage` 모델

파일:

- `backend/app/models/post_image.py`

테이블:

```txt
post_images
```

`PostImage`는 게시글 이미지 정보를 저장한다.

중요한 점은 `post_id`가 nullable이라는 것이다.

```py
post_id: Mapped[int | None]
```

이렇게 한 이유는 Phase 6에서 게시글 작성 전에 이미지를 먼저 업로드할 수 있어야 하기 때문이다.

흐름은 다음과 같다.

```txt
1. 사용자가 글 작성 화면에서 이미지를 먼저 업로드한다.
2. post_id 없이 TEMP 이미지로 저장된다.
3. 게시글 작성이 완료된다.
4. image_ids를 이용해 이미지들이 게시글에 연결된다.
```

핵심 필드는 다음과 같다.

- `post_id`: 연결된 게시글, 임시 이미지일 때는 null
- `uploader_id`: 업로더
- `file_url`: 원본 이미지 주소
- `thumbnail_url`: 썸네일 주소
- `original_name`: 원본 파일명
- `mime_type`: 파일 MIME 타입
- `size_bytes`: 파일 크기
- `width`, `height`: 이미지 크기
- `sort_order`: 노출 순서
- `status`: `TEMP`, `ATTACHED`, `DELETED`, `FAILED`

### 13. `backend/app/models/__init__.py`

이 파일은 모델들을 한 번에 import하기 위한 진입점이다.

```py
from app.models.user import User
from app.models.post import Post
...
```

SQLAlchemy의 `Base.metadata`는 import된 모델만 알 수 있다.

즉 모델 파일이 존재하더라도 import되지 않으면 `create_all()`이 그 테이블을 만들지 못한다.

그래서 `app.models`를 import하면 MVP 모델들이 모두 등록되도록 만들었다.

### 14. `backend/app/db/init_db.py`

Phase 1에서는 `init_db()`가 바로 `Base.metadata.create_all()`만 호출했다.

Phase 2에서는 그 전에 모델 import를 추가했다.

```py
import app.models
```

전체 흐름은 다음과 같다.

```txt
init_db()
-> app.models import
-> User, Board, Post 등 모델 클래스 로드
-> Base.metadata에 테이블 정보 등록
-> Base.metadata.create_all(bind=engine)
-> DB에 없는 테이블 생성
```

Alembic을 쓰지 않기 때문에 이 프로젝트의 MVP 단계에서는 `init_db()`가 테이블 생성 준비의 중심이다.

### 15. `scripts/seed_boards.py`

이 스크립트는 기본 게시판 데이터를 만든다.

실행 방법:

```bash
python scripts/seed_boards.py
```

생성 또는 갱신되는 게시판은 4개다.

| code | name | sort_order |
| --- | --- | --- |
| `REVIEW` | 피규어 후기 | 1 |
| `INFO` | 정보 | 2 |
| `QUESTION` | 질문 | 3 |
| `PURCHASE_HELP` | 구매 고민 | 4 |

`NOTICE`, `FAQ`는 기본 게시판으로 만들지 않는다.

스크립트 안에는 다음 코드가 있다.

```py
EXCLUDED_BOARD_CODES = [BoardCode.NOTICE, BoardCode.FAQ]
```

그리고 seed 실행 시 혹시 기존에 `NOTICE`, `FAQ` row가 있다면 삭제한다.

```py
db.query(Board).filter(Board.code.in_(EXCLUDED_BOARD_CODES)).delete(
    synchronize_session=False
)
```

즉 seed 결과는 MVP 기본 게시판 4개만 남는 것을 목표로 한다.

또한 이 스크립트는 idempotent하게 작성했다.

idempotent하다는 말은 여러 번 실행해도 같은 결과가 된다는 뜻이다.

이미 `REVIEW` 게시판이 있으면 새로 만들지 않고 이름, 설명, 정렬 순서, 활성 상태를 갱신한다.

### 16. 이번 Phase에서 하지 않은 것

이번 Phase에서는 아래를 구현하지 않았다.

- API endpoint
- Pydantic schema
- repository
- service
- 회원가입
- 로그인
- 게시글 작성
- 댓글 작성
- 이미지 업로드 로직
- 태그 생성 API
- AI 모델
- 외부 링크 미리보기 모델
- 신고 모델

지금 단계는 DB 테이블의 모양을 잡는 단계다.

### 17. 확인 방법

Python 문법 확인:

```bash
cd backend
python -m py_compile app/models/enums.py app/models/user.py app/models/auth_session.py app/models/board.py app/models/post.py app/models/post_figure_info.py app/models/comment.py app/models/tag.py app/models/post_tag.py app/models/post_image.py app/models/__init__.py app/db/init_db.py
```

모델 import 확인:

```bash
cd backend
python -c "from app.models import User, Board, Post; from app.db.base import Base; print(sorted(Base.metadata.tables.keys()))"
```

DB가 켜져 있다면 테이블 생성과 seed 확인:

```bash
python scripts/seed_boards.py
```

기대 결과:

```txt
Seeded boards: REVIEW, INFO, QUESTION, PURCHASE_HELP
```

DB에서 확인할 내용:

```txt
boards 테이블에 REVIEW, INFO, QUESTION, PURCHASE_HELP만 있다.
NOTICE, FAQ는 없다.
```

### 18. 다음 Phase로 넘어가기 전에 이해해야 할 것

Phase 3으로 넘어가기 전에 아래를 이해하면 좋다.

- SQLAlchemy 모델 하나는 보통 DB 테이블 하나에 대응한다.
- `ForeignKey`는 다른 테이블의 row를 참조한다.
- `relationship`은 Python 코드에서 연결된 객체를 쉽게 접근하게 해준다.
- `PostTag` 같은 연결 테이블은 N:M 관계를 표현한다.
- `status`, `deleted_at`을 함께 쓰면 soft delete를 구현할 수 있다.
- Alembic을 쓰지 않으므로 테이블 생성은 `init_db()`와 seed 스크립트로 직접 실행한다.

## Phase 3. 회원가입 / 로그인 / JWT 인증

### 1. 이번 Phase의 목표

Phase 3의 목표는 사용자가 회원가입하고 로그인한 뒤, access token으로 보호 API를 호출할 수 있게 만드는 것이다.

이번 Phase에서 구현한 핵심 흐름은 다음과 같다.

```txt
회원가입
-> 비밀번호 해시 저장
-> 로그인
-> access token + refresh token 발급
-> 프론트 localStorage 저장
-> Authorization header로 보호 API 호출
-> GET /api/v1/users/me 성공
```

아직 게시글 작성, 댓글 작성, 이미지 업로드는 구현하지 않는다. 이번 단계는 이후 Phase에서 “로그인한 사용자만 할 수 있는 기능”을 만들기 위한 인증 기반이다.

### 2. 수정한 파일 목록

백엔드:

- `backend/app/core/config.py`
- `backend/app/core/security.py`
- `backend/app/schemas/auth_schema.py`
- `backend/app/schemas/user_schema.py`
- `backend/app/repositories/user_repository.py`
- `backend/app/services/auth_service.py`
- `backend/app/services/user_service.py`
- `backend/app/api/deps.py`
- `backend/app/api/routes/auth.py`
- `backend/app/api/routes/users.py`
- `backend/app/main.py`

프론트엔드:

- `frontend/src/api/authApi.js`
- `frontend/src/api/userApi.js`
- `frontend/src/hooks/useAuth.js`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/pages/SignupPage.jsx`
- `frontend/src/App.jsx`
- `frontend/src/App.css`

문서:

- `docs/implementation-guide.md`

### 3. `backend/app/core/config.py`

Phase 3에서는 JWT와 token 만료 시간을 설정으로 추가했다.

```py
self.jwt_secret_key = os.getenv("JWT_SECRET_KEY", "change-this-secret")
self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256")
self.access_token_expire_minutes = self._parse_int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"),
    30,
)
self.refresh_token_expire_days = self._parse_int(
    os.getenv("REFRESH_TOKEN_EXPIRE_DAYS"),
    14,
)
```

이 값들은 `backend/.env`에서 읽는다.

```env
JWT_SECRET_KEY=change-this-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=14
```

의미는 다음과 같다.

- `JWT_SECRET_KEY`: access token을 서명할 때 쓰는 비밀키
- `JWT_ALGORITHM`: JWT 서명 알고리즘
- `ACCESS_TOKEN_EXPIRE_MINUTES`: access token 만료 시간
- `REFRESH_TOKEN_EXPIRE_DAYS`: refresh token 만료 일수

`_parse_int()`는 환경변수 문자열을 숫자로 바꾸는 함수다. 잘못된 값이 들어오면 기본값을 사용한다.

### 4. `backend/app/core/security.py`

이 파일은 인증과 보안 관련 순수 함수들을 모아둔 곳이다.

비밀번호 저장 흐름:

```py
def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")
```

비밀번호 원문은 DB에 저장하지 않는다. 회원가입 때 사용자가 입력한 비밀번호를 bcrypt로 해시한 뒤 `users.password_hash`에 저장한다.

로그인 검증 흐름:

```py
def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(
        password.encode("utf-8"),
        password_hash.encode("utf-8"),
    )
```

사용자가 로그인할 때 입력한 비밀번호를 다시 해시해서 비교하는 것이 아니라, bcrypt의 `checkpw()`가 원문 비밀번호와 저장된 해시를 비교한다.

access token 생성:

```py
payload = {
    "sub": str(user_id),
    "type": "access",
    "iat": now,
    "exp": expires_at,
}
```

JWT payload에는 다음 값을 넣는다.

- `sub`: 사용자 ID
- `type`: token 용도, 여기서는 `access`
- `iat`: 발급 시각
- `exp`: 만료 시각

refresh token은 JWT가 아니라 랜덤 문자열이다.

```py
def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)
```

DB에는 refresh token 원문을 저장하지 않고 sha256 해시만 저장한다.

```py
def hash_refresh_token(refresh_token: str) -> str:
    return sha256(refresh_token.encode("utf-8")).hexdigest()
```

이렇게 하면 DB가 노출되더라도 refresh token 원문이 바로 유출되지 않는다.

### 5. Schema 파일

`backend/app/schemas/auth_schema.py`는 인증 API의 요청/응답 모양을 정의한다.

대표 schema:

- `SignupRequest`: 회원가입 요청
- `LoginRequest`: 로그인 요청
- `TokenRefreshRequest`: refresh 요청
- `LogoutRequest`: 로그아웃 요청
- `TokenResponse`: 로그인 응답
- `TokenRefreshResponse`: refresh 응답

회원가입 요청:

```py
class SignupRequest(BaseModel):
    email: EmailStr
    login_id: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=72)
    nickname: str = Field(min_length=2, max_length=50)
```

`EmailStr`은 이메일 형식을 검증한다. `password`의 최대 길이를 72로 둔 이유는 bcrypt가 다루는 비밀번호 길이 제한을 고려했기 때문이다.

`backend/app/schemas/user_schema.py`는 사용자 응답 모양을 정의한다.

- `UserSummary`: token 응답 안에 들어가는 간단한 사용자 정보
- `UserResponse`: `/users/me`에서 반환하는 자세한 사용자 정보

두 schema 모두 `from_attributes=True`를 사용한다.

```py
model_config = ConfigDict(from_attributes=True)
```

이 설정이 있어야 SQLAlchemy 모델 객체를 Pydantic 응답으로 바로 변환할 수 있다.

### 6. Repository 계층

파일:

- `backend/app/repositories/user_repository.py`

repository는 DB 조회와 저장만 담당한다.

예를 들어 로그인 ID로 사용자를 찾는 함수는 다음과 같다.

```py
def get_user_by_login_id(db: Session, login_id: str) -> User | None:
    statement = select(User).where(User.login_id == login_id)
    return db.scalar(statement)
```

refresh session 조회 함수는 만료되지 않았고 폐기되지 않은 session만 찾는다.

```py
AuthSession.revoked_at.is_(None)
AuthSession.expires_at > now
```

즉 로그아웃했거나 만료된 refresh token은 재사용할 수 없다.

### 7. Service 계층

파일:

- `backend/app/services/auth_service.py`
- `backend/app/services/user_service.py`

service는 실제 비즈니스 판단을 담당한다.

회원가입 흐름:

```txt
email 중복 확인
-> login_id 중복 확인
-> password hash 생성
-> User 생성
-> commit
-> UserResponse 반환
```

중복 이메일은 다음 에러를 반환한다.

```txt
409 Conflict
EMAIL_ALREADY_EXISTS
```

중복 로그인 ID는 다음 에러를 반환한다.

```txt
409 Conflict
LOGIN_ID_ALREADY_EXISTS
```

로그인 흐름:

```txt
login_id로 사용자 조회
-> 비밀번호 검증
-> 계정 상태 ACTIVE 확인
-> access token 생성
-> refresh token 생성
-> refresh token hash DB 저장
-> token 응답 반환
```

refresh 흐름:

```txt
refresh token 원문 수신
-> sha256 hash 계산
-> DB에서 active session 조회
-> 기존 session revoked_at 기록
-> 새 refresh token 생성
-> 새 session 저장
-> 새 access/refresh token 반환
```

이 방식은 refresh token rotation이다. refresh token을 사용할 때마다 새 refresh token을 발급하고 기존 token은 폐기한다.

로그아웃 흐름:

```txt
refresh token 수신
-> DB에서 active session 조회
-> 있으면 revoked_at 기록
-> 204 No Content 반환
```

### 8. `backend/app/api/deps.py`

Phase 3에서는 인증 dependency를 추가했다.

```py
bearer_scheme = HTTPBearer(auto_error=False)
```

이 코드는 `Authorization: Bearer <token>` 헤더를 읽는다.

`get_current_user()`는 보호 API에서 현재 로그인 사용자를 구하는 함수다.

흐름:

```txt
Authorization header 확인
-> access token decode
-> sub에서 user_id 추출
-> DB에서 사용자 조회
-> ACTIVE 상태 확인
-> User 객체 반환
```

이 함수는 다음처럼 사용할 수 있다.

```py
def get_me(current_user: CurrentUser, db: DbSession):
    ...
```

`CurrentUser`를 route parameter에 넣으면 FastAPI가 자동으로 토큰을 확인하고 현재 사용자를 넣어준다.

### 9. Route 파일

`backend/app/api/routes/auth.py`는 인증 API를 제공한다.

구현된 API:

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

라우터는 요청을 받고 service를 호출하는 얇은 계층으로 유지했다.

```py
@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    return auth_service.login(db, payload)
```

`backend/app/api/routes/users.py`는 사용자 API를 제공한다.

이번 Phase에서는 하나만 구현했다.

```txt
GET /api/v1/users/me
```

이 API는 `CurrentUser` dependency를 사용하므로 access token이 없으면 실패한다.

### 10. `backend/app/main.py`

Phase 3에서는 인증 라우터를 FastAPI 앱에 등록했다.

```py
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(users_router, prefix=settings.api_prefix)
```

각 라우터 내부 prefix와 합쳐져 실제 주소는 다음처럼 된다.

```txt
/api/v1/auth/login
/api/v1/users/me
```

기존 health check는 그대로 유지된다.

### 11. 프론트 API 파일

`frontend/src/api/authApi.js`는 인증 API 호출 함수를 모아둔다.

```js
export async function login(payload) {
  const response = await axiosInstance.post("/auth/login", payload);
  return response.data;
}
```

`axiosInstance`의 `baseURL`이 `/api/v1`까지 포함하므로 실제 요청은 아래 주소로 간다.

```txt
http://localhost:8000/api/v1/auth/login
```

`frontend/src/api/userApi.js`는 내 정보 조회를 담당한다.

```js
export async function getMe() {
  const response = await axiosInstance.get("/users/me");
  return response.data;
}
```

### 12. `frontend/src/hooks/useAuth.js`

이 hook은 프론트의 로그인 상태를 관리한다.

관리하는 값:

- `user`: 현재 로그인 사용자
- `status`: `loading`, `anonymous`, `authenticated`
- `errorMessage`: 인증 요청 에러 메시지

로그인에 성공하면 token을 localStorage에 저장한다.

```js
localStorage.setItem("access_token", accessToken);
localStorage.setItem("refresh_token", refreshToken);
```

Phase 0에서 만든 `axiosInstance`는 요청마다 localStorage의 access token을 읽어서 Authorization header를 붙인다.

```js
config.headers.Authorization = `Bearer ${token}`;
```

그래서 로그인 후 `getMe()`를 호출하면 자동으로 인증 헤더가 붙는다.

로그아웃하면 token을 제거한다.

```js
localStorage.removeItem("access_token");
localStorage.removeItem("refresh_token");
```

### 13. 프론트 화면

이번 Phase에서는 정식 라우팅을 만들지 않았다. Phase 10에서 전체 화면 이동 구조를 정리할 예정이다.

대신 `App.jsx`에서 Phase 3 확인용 화면을 구성했다.

화면에 보이는 것:

- API base URL
- health check 상태
- auth status
- 회원가입 폼
- 로그인 폼
- 로그인한 사용자의 내 정보
- 로그아웃 버튼

`LoginPage.jsx`와 `SignupPage.jsx`는 각각 자신의 form state를 가진다. 입력 후 submit하면 `useAuth`가 제공하는 `login`, `signup` 함수를 호출한다.

### 14. 실행 전 준비

이 프로젝트는 앱 시작 시 자동으로 `create_all()`을 실행하지 않는다.

DB가 켜져 있다면 먼저 seed 스크립트를 실행한다.

```bash
python scripts/seed_boards.py
```

이 스크립트 안에서 `init_db()`를 호출하므로 MVP 테이블이 함께 생성된다.

### 15. 확인 방법

백엔드 실행:

```bash
cd backend
python -m uvicorn app.main:app --reload
```

프론트 실행:

```bash
cd frontend
npm run dev
```

회원가입:

```txt
POST /api/v1/auth/signup
```

로그인:

```txt
POST /api/v1/auth/login
```

내 정보 조회:

```txt
GET /api/v1/users/me
Authorization: Bearer <access_token>
```

토큰 없이 `/users/me`를 호출하면 `401 Unauthorized`가 나와야 한다.

### 16. 다음 Phase로 넘어가기 전에 이해해야 할 것

Phase 4로 넘어가기 전에 아래를 이해하면 좋다.

- 비밀번호 원문은 DB에 저장하지 않고 bcrypt hash만 저장한다.
- access token은 짧게 쓰는 JWT다.
- refresh token은 긴 로그인 유지용 token이며 DB에는 해시만 저장한다.
- 보호 API는 `CurrentUser` dependency로 현재 사용자를 받는다.
- 라우터는 요청과 응답만 담당하고, 판단은 service가 한다.
- DB 조회와 저장은 repository가 담당한다.

## Phase 4. 게시판 목록과 게시글 읽기

### 1. 이번 Phase의 목표

Phase 4의 목표는 로그인하지 않은 사용자도 게시판과 게시글을 읽을 수 있게 만드는 것이다.

이번 phase에서 구현한 API는 네 개다.

```txt
GET /api/v1/boards
GET /api/v1/boards/{board_code}
GET /api/v1/posts
GET /api/v1/posts/{post_id}
```

아직 구현하지 않는 것은 명확히 남겨두었다.

- 게시글 작성 / 수정 / 삭제
- 댓글
- 이미지 업로드
- 태그 자동완성
- 검색 전용 API
- AI / MCP 관련 기능
- 사용자가 URL을 직접 입력하는 기능

즉 이번 단계는 게시판 서비스의 "읽기 화면"을 먼저 완성하는 단계다.

### 2. 수정한 파일 목록

백엔드:

- `backend/app/schemas/board_schema.py`
- `backend/app/schemas/post_schema.py`
- `backend/app/repositories/board_repository.py`
- `backend/app/repositories/post_repository.py`
- `backend/app/services/board_service.py`
- `backend/app/services/post_service.py`
- `backend/app/api/routes/boards.py`
- `backend/app/api/routes/posts.py`
- `backend/app/main.py`
- `scripts/seed_sample_posts.py`

프론트엔드:

- `frontend/src/api/boardApi.js`
- `frontend/src/api/postApi.js`
- `frontend/src/hooks/usePosts.js`
- `frontend/src/pages/HomePage.jsx`
- `frontend/src/pages/PostListPage.jsx`
- `frontend/src/pages/PostDetailPage.jsx`
- `frontend/src/components/post/PostCard.jsx`
- `frontend/src/components/post/PostList.jsx`
- `frontend/src/App.jsx`
- `frontend/src/App.css`

문서:

- `docs/implementation-guide.md`

### 3. 백엔드 전체 흐름

Phase 4 백엔드는 Phase 3과 같은 계층 구조를 따른다.

```txt
FastAPI route
-> service
-> repository
-> SQLAlchemy model
-> PostgreSQL
```

각 계층의 역할은 다음과 같다.

- route: HTTP 요청을 받고 service를 호출한다.
- service: 비즈니스 규칙, 에러 처리, 응답 조립을 담당한다.
- repository: DB 조회 SQLAlchemy 코드를 담당한다.
- schema: API 요청과 응답의 모양을 정의한다.
- model: 실제 DB table과 Python class의 매핑이다.

이렇게 나누면 FastAPI, SQLAlchemy, Pydantic이 각각 어떤 역할을 하는지 분리해서 공부할 수 있다.

### 4. 게시판 스키마

`backend/app/schemas/board_schema.py`에는 게시판 응답 모델을 만들었다.

```py
class BoardSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: BoardCode
    name: str
```

`BoardSummary`는 게시글 응답 안에 들어가는 작은 게시판 정보다.

게시글 목록에서 게시판 설명까지 모두 보여줄 필요는 없으므로 `id`, `code`, `name`만 담는다.

```py
class BoardResponse(BoardSummary):
    description: str | None = None
    sort_order: int
    is_active: bool
```

`BoardResponse`는 게시판 API에서 직접 반환하는 응답이다. 목록 화면에서 필요한 설명과 정렬 순서, 활성 여부를 포함한다.

여기서 중요한 부분은 `ConfigDict(from_attributes=True)`다.

Pydantic은 원래 dict를 검증하는 도구다. 그런데 SQLAlchemy model 객체는 dict가 아니라 Python 객체다. `from_attributes=True`를 켜면 Pydantic이 `board.id`, `board.code`처럼 객체 attribute를 읽어서 응답 모델로 바꿀 수 있다.

### 5. 게시글 스키마

`backend/app/schemas/post_schema.py`는 게시글 목록 응답과 상세 응답을 나누어 정의한다.

목록 응답은 가볍게 만든다.

```py
class PostListItemResponse(BaseModel):
    id: int
    board: BoardSummary
    author: UserSummary
    title: str
    summary: str
    thumbnail_url: str | None = None
    tags: list[TagSummary]
    figure_info: PostFigureInfoSummary | None = None
    view_count: int
    comment_count: int
    published_at: datetime | None = None
```

목록에서는 본문 전체를 내려주지 않고 `summary`만 내려준다. 목록 화면은 많은 게시글을 한 번에 보여주기 때문에 응답을 가볍게 유지하는 것이 좋다.

상세 응답은 본문과 부가 정보를 포함한다.

```py
class PostDetailResponse(BaseModel):
    id: int
    board: BoardSummary
    author: UserSummary
    title: str
    content: str
    source_type: PostSourceType
    status: PostStatus
    view_count: int
    comment_count: int
    figure_info: PostFigureInfoResponse | None = None
    tags: list[TagSummary]
    images: list[PostImageResponse]
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
```

`figure_info`에서 특히 중요한 점이 있다.

API에서는 사용자가 이해하기 쉬운 이름인 `figure_name`, `manufacturer`를 사용한다. DB에서는 컬럼 충돌을 피하고 의미를 분명히 하기 위해 `figure_name_text`, `manufacturer_text`를 사용한다.

따라서 service 계층에서 아래처럼 매핑한다.

```txt
DB:  figure_name_text
API: figure_name

DB:  manufacturer_text
API: manufacturer
```

이 매핑은 schema가 아니라 service에 둔다. schema는 응답 모양만 알고, DB 컬럼 이름 차이를 어떻게 변환할지는 service가 담당한다.

### 6. 게시판 repository

`backend/app/repositories/board_repository.py`는 게시판 DB 조회만 담당한다.

```py
def list_active_boards(db: Session) -> list[Board]:
    statement = (
        select(Board)
        .where(Board.is_active.is_(True))
        .order_by(Board.sort_order.asc(), Board.id.asc())
    )
    return list(db.scalars(statement).all())
```

SQLAlchemy 2.x에서는 `select()`를 사용해서 SQL을 Python 코드로 만든다.

위 코드는 SQL로 보면 대략 아래와 같다.

```sql
SELECT *
FROM boards
WHERE is_active = true
ORDER BY sort_order ASC, id ASC;
```

`db.scalars(statement)`는 조회 결과에서 `Board` 객체만 꺼내준다. `select(Board)`를 했으므로 각 row에서 첫 번째 값은 `Board` 객체다.

### 7. 게시글 repository

`backend/app/repositories/post_repository.py`는 게시글 조회와 count를 담당한다.

게시글 목록 조회에서는 공개 게시글만 가져온다.

```py
Post.status == PostStatus.PUBLISHED
Post.deleted_at.is_(None)
Board.is_active.is_(True)
```

이 조건의 의미는 다음과 같다.

- `PUBLISHED`: 게시된 글만 보여준다.
- `deleted_at is None`: soft delete 된 글은 숨긴다.
- `Board.is_active is True`: 비활성 게시판의 글은 숨긴다.

목록 조회는 `Post`만 필요한 것처럼 보이지만 실제 응답에는 작성자, 게시판, 피규어 정보, 이미지, 태그가 필요하다. 그래서 관계 데이터를 함께 로딩한다.

```py
.options(
    joinedload(Post.board),
    joinedload(Post.author),
    selectinload(Post.figure_infos),
    selectinload(Post.images),
    selectinload(Post.tag_links).joinedload(PostTag.tag),
)
```

여기서 SQLAlchemy 관계 로딩 전략을 공부할 수 있다.

`joinedload`는 SQL JOIN으로 한 번에 가져오기 좋은 관계에 쓴다.

- 게시글 하나는 게시판 하나를 가진다.
- 게시글 하나는 작성자 하나를 가진다.

이런 N:1 관계는 `joinedload`가 잘 맞는다.

`selectinload`는 목록 관계에 적합하다.

- 게시글 하나는 여러 피규어 정보를 가질 수 있다.
- 게시글 하나는 여러 이미지를 가질 수 있다.
- 게시글 하나는 여러 태그 연결을 가질 수 있다.

이런 1:N 관계를 무리하게 JOIN하면 row가 중복되어 목록이 부풀 수 있다. `selectinload`는 먼저 게시글 목록을 가져온 뒤, 그 게시글 id 목록을 이용해서 관련 데이터를 별도 SELECT로 가져온다.

페이지네이션은 `offset`과 `limit`으로 처리한다.

```py
.offset((page - 1) * size)
.limit(size)
```

예를 들어 `page=2`, `size=20`이면 앞의 20개를 건너뛰고 다음 20개를 가져온다.

### 8. 게시판 service

`backend/app/services/board_service.py`는 repository 결과를 API 응답으로 바꾼다.

```py
def get_board(db: Session, *, board_code: BoardCode) -> BoardResponse:
    board = board_repository.get_active_board_by_code(db, board_code)

    if board is None:
        raise AppException(
            "게시판을 찾을 수 없습니다.",
            code="BOARD_NOT_FOUND",
            status_code=404,
        )

    return BoardResponse.model_validate(board)
```

없는 게시판을 `None`으로 그대로 반환하지 않고 service에서 `AppException`을 발생시킨다.

이 프로젝트의 공통 예외 처리기는 `AppException`을 아래 구조로 바꿔준다.

```json
{
  "error": {
    "code": "BOARD_NOT_FOUND",
    "message": "게시판을 찾을 수 없습니다."
  }
}
```

### 9. 게시글 service

`backend/app/services/post_service.py`는 게시글 응답을 조립하는 가장 중요한 파일이다.

목록 응답은 다음 흐름으로 만든다.

```txt
total count 조회
-> 현재 page의 게시글 목록 조회
-> 각 Post model을 PostListItemResponse로 변환
-> items/page/size/total/has_next 반환
```

`has_next`는 아래 공식으로 계산한다.

```py
has_next = page * size < total
```

예를 들어 전체 45개, `page=2`, `size=20`이면 `2 * 20 < 45`가 true이므로 다음 페이지가 있다.

상세 조회는 조회수를 증가시킨다.

```py
post_repository.increment_view_count(post)
db.commit()
db.refresh(post)
```

`commit()`은 DB에 변경사항을 저장한다. `refresh()`는 저장 후 DB 값을 다시 읽어 SQLAlchemy 객체에 반영한다.

피규어 정보는 service에서 API 필드명으로 바꾼다.

```py
return PostFigureInfoResponse(
    id=figure_info.id,
    figure_name=figure_info.figure_name_text,
    manufacturer=figure_info.manufacturer_text,
    ...
)
```

이 코드를 보면 DB 모델과 API 모델을 일부러 분리한 이유가 보인다.

- DB 모델은 저장 구조를 표현한다.
- API 스키마는 클라이언트와 약속한 응답 구조를 표현한다.
- service는 둘 사이의 번역을 담당한다.

### 10. FastAPI route

`backend/app/api/routes/boards.py`는 두 API를 연결한다.

```py
@router.get("", response_model=BoardListResponse)
def list_boards(db: DbSession) -> BoardListResponse:
    return board_service.list_boards(db)
```

`DbSession`은 Phase 1에서 만든 dependency다. FastAPI가 요청마다 DB session을 만들고 route 함수에 주입한다.

`backend/app/api/routes/posts.py`는 query parameter를 검증한다.

```py
def list_posts(
    db: DbSession,
    board_code: BoardCode | None = Query(default=None),
    sort: Literal["latest", "views"] = Query(default="latest"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
) -> PostListResponse:
```

여기서 FastAPI가 해주는 일이 많다.

- `board_code`가 `BoardCode` enum에 없는 값이면 422를 반환한다.
- `sort`가 `latest`, `views`가 아니면 422를 반환한다.
- `page`가 1보다 작으면 422를 반환한다.
- `size`가 50보다 크면 422를 반환한다.

즉 기본적인 요청 검증은 route 함수 선언만으로 처리된다.

### 11. FastAPI 앱에 라우터 등록

`backend/app/main.py`에 게시판과 게시글 라우터를 추가했다.

```py
app.include_router(boards_router, prefix=settings.api_prefix)
app.include_router(posts_router, prefix=settings.api_prefix)
```

각 router 자체는 `/boards`, `/posts` prefix를 가진다. `settings.api_prefix`의 기본값은 `/api/v1`이다.

따라서 실제 URL은 다음과 같이 만들어진다.

```txt
/api/v1 + /boards = /api/v1/boards
/api/v1 + /posts  = /api/v1/posts
```

### 12. 샘플 게시글 seed

`scripts/seed_sample_posts.py`는 Phase 4 확인용 데이터를 만든다.

이 스크립트는 게시글 작성 API를 대신하는 기능이 아니다. Phase 5에서 작성 API를 만들기 전까지 목록/상세 화면을 확인하기 위한 개발용 seed다.

생성하는 데이터:

- 샘플 사용자 1명
- REVIEW 게시글 1개
- INFO 게시글 1개
- QUESTION 게시글 1개
- PURCHASE_HELP 게시글 1개
- REVIEW 게시글의 `PostFigureInfo` 1개

먼저 게시판 seed를 실행해야 한다.

```bash
python scripts/seed_boards.py
python scripts/seed_sample_posts.py
```

`seed_sample_posts.py`는 같은 제목과 같은 작성자의 게시글이 이미 있으면 새로 만들지 않고 내용을 갱신한다. 그래서 여러 번 실행해도 샘플 게시글이 계속 중복 생성되지 않는다.

### 13. 프론트 API 파일

`frontend/src/api/boardApi.js`는 게시판 API만 담당한다.

```js
export async function getBoards() {
  const response = await axiosInstance.get("/boards");
  return response.data;
}
```

`axiosInstance`의 base URL은 이미 `/api/v1`까지 포함한다. 그래서 `"/boards"`만 넘기면 실제 요청은 아래 주소로 간다.

```txt
http://localhost:8000/api/v1/boards
```

`frontend/src/api/postApi.js`는 게시글 API만 담당한다.

```js
export async function getPosts(params = {}) {
  const response = await axiosInstance.get("/posts", { params });
  return response.data;
}
```

axios에서 `params`를 넘기면 query string을 자동으로 만들어준다.

```js
getPosts({ board_code: "REVIEW", page: 1, size: 10 })
```

위 호출은 아래 요청이 된다.

```txt
GET /api/v1/posts?board_code=REVIEW&page=1&size=10
```

화면 컴포넌트가 URL 문자열을 직접 조립하지 않게 한 것이 핵심이다.

### 14. React hook

`frontend/src/hooks/usePosts.js`는 게시글 목록과 상세 조회 상태를 관리한다.

```js
export function usePostList({
  boardCode = "",
  page = 1,
  size = 20,
  sort = "latest",
} = {}) {
```

이 hook이 관리하는 상태는 세 가지다.

- `data`: API 응답 전체
- `isLoading`: 요청 중인지 여부
- `errorMessage`: 실패 메시지

React의 `useEffect`는 dependency 값이 바뀔 때 다시 실행된다.

```js
}, [boardCode, page, size, sort]);
```

따라서 게시판 필터, 페이지, 정렬이 바뀌면 자동으로 목록 API를 다시 호출한다.

`ignore` 변수는 컴포넌트가 사라진 뒤 늦게 도착한 API 응답이 state를 바꾸지 못하게 막는다.

```js
return () => {
  ignore = true;
};
```

이 패턴은 React에서 비동기 요청을 배울 때 중요하다. 화면을 빠르게 이동하면 이전 요청이 나중에 도착할 수 있기 때문이다.

### 15. 프론트 화면 구성

Phase 4에서는 아직 React Router를 도입하지 않았다. 정식 URL 라우팅은 Phase 10에서 구현한다.

대신 `frontend/src/App.jsx`에서 간단한 상태 기반 화면 전환을 만들었다.

```js
const [currentView, setCurrentView] = useState("home");
const [selectedBoardCode, setSelectedBoardCode] = useState("");
const [selectedPostId, setSelectedPostId] = useState(null);
```

현재 화면은 세 가지다.

- `home`: 게시판 목록과 최신 게시글
- `posts`: 게시글 목록
- `detail`: 게시글 상세

게시판을 누르면:

```js
function openBoard(boardCode) {
  setCurrentView("posts");
  setSelectedBoardCode(boardCode);
  setSelectedPostId(null);
}
```

게시글을 누르면:

```js
function openPost(postId) {
  setCurrentView("detail");
  setSelectedPostId(postId);
}
```

이 구조는 React Router보다 기능은 단순하지만, state가 화면을 어떻게 바꾸는지 공부하기에 좋다.

### 16. 페이지 컴포넌트

`HomePage.jsx`는 두 가지 데이터를 가져온다.

- 게시판 목록: `getBoards()`
- 최신 게시글: `usePostList({ page: 1, size: 5, sort: "latest" })`

`PostListPage.jsx`는 게시판 필터, 정렬, 페이지를 state로 가진다.

```js
const [boardCode, setBoardCode] = useState(initialBoardCode);
const [sort, setSort] = useState("latest");
const [page, setPage] = useState(1);
```

필터가 바뀌면 첫 페이지로 돌아간다.

```js
function handleBoardChange(event) {
  setBoardCode(event.target.value);
  setPage(1);
}
```

`PostDetailPage.jsx`는 `postId`를 받아 상세 API를 호출한다. 상세 API는 조회수를 증가시키므로 상세 화면에 들어갈 때마다 `view_count`가 증가한다.

이미지 URL은 백엔드가 `/uploads/...`처럼 상대 경로를 줄 수 있으므로 프론트에서 API origin을 붙인다.

```js
const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
return `${apiOrigin}${url}`;
```

이미지 업로드 자체는 Phase 6에서 구현하지만, 상세 응답과 화면 구조는 미리 `images: []`를 다룰 수 있게 준비했다.

### 17. 목록 컴포넌트

`PostList.jsx`는 목록 상태를 표시하는 컴포넌트다.

처리하는 상태:

- 로딩 중
- 에러
- 빈 목록
- 게시글 목록

`PostCard.jsx`는 게시글 하나를 보여준다. 이 컴포넌트는 API를 직접 호출하지 않는다. 전달받은 `post`를 표시하고, 클릭되면 `onSelectPost(post.id)`만 호출한다.

이렇게 만들면 컴포넌트를 두 종류로 나누어 공부할 수 있다.

- data component: API 호출과 state를 가진다.
- presentational component: props를 화면에 그린다.

### 18. 이번 Phase의 요청/응답 예시

게시판 목록:

```txt
GET /api/v1/boards
```

응답:

```json
{
  "items": [
    {
      "id": 1,
      "code": "REVIEW",
      "name": "피규어 후기",
      "description": "피규어 사진과 후기를 공유하는 게시판",
      "sort_order": 1,
      "is_active": true
    }
  ]
}
```

게시글 목록:

```txt
GET /api/v1/posts?board_code=REVIEW&page=1&size=10&sort=latest
```

응답 구조:

```json
{
  "items": [],
  "page": 1,
  "size": 10,
  "total": 0,
  "has_next": false
}
```

게시글 상세:

```txt
GET /api/v1/posts/1
```

응답에는 본문, 작성자, 게시판, 피규어 정보, 태그, 이미지 배열이 포함된다.

### 19. 확인 방법

DB와 샘플 데이터 준비:

```bash
python scripts/seed_boards.py
python scripts/seed_sample_posts.py
```

백엔드 실행:

```bash
cd backend
python -m uvicorn app.main:app --reload
```

프론트 실행:

```bash
cd frontend
npm run dev
```

API 확인:

```txt
GET /api/v1/boards
GET /api/v1/boards/REVIEW
GET /api/v1/posts?page=1&size=20
GET /api/v1/posts?board_code=REVIEW
GET /api/v1/posts/{post_id}
```

없는 게시글을 조회하면 아래 에러가 나와야 한다.

```json
{
  "error": {
    "code": "POST_NOT_FOUND",
    "message": "게시글을 찾을 수 없습니다."
  }
}
```

### 20. 이번 Phase에서 배울 수 있는 것

FastAPI:

- path parameter와 query parameter를 함수 인자로 받는 방법
- `Query(ge=1, le=50)` 같은 선언형 검증
- `response_model`로 응답 모양을 고정하는 방법
- dependency로 DB session을 주입받는 방법

SQLAlchemy:

- `select()`로 조회 쿼리를 만드는 방법
- `join()`으로 게시글과 게시판을 함께 필터링하는 방법
- `joinedload()`와 `selectinload()`의 차이
- `offset()`과 `limit()`으로 페이지네이션을 구현하는 방법
- model 객체의 값을 바꾸고 `commit()`으로 저장하는 방법

PostgreSQL:

- 게시글, 게시판, 사용자, 피규어 정보가 foreign key로 연결되는 방식
- 목록 조회에서 count query와 data query를 분리하는 이유
- soft delete 글을 `deleted_at is null` 조건으로 숨기는 방식

React:

- API 호출 함수를 화면 컴포넌트와 분리하는 방법
- custom hook으로 loading/error/data 상태를 재사용하는 방법
- `useEffect` dependency가 바뀔 때 데이터를 다시 불러오는 방식
- state 기반으로 홈, 목록, 상세 화면을 전환하는 방식

### 21. 다음 Phase로 넘어가기 전에 이해해야 할 것

Phase 5에서는 로그인 사용자가 게시글을 작성, 수정, 삭제할 수 있게 된다. 그 전에 아래를 이해하면 좋다.

- 읽기 API는 비회원도 접근 가능하다.
- 쓰기 API는 `CurrentUser` dependency가 필요하다.
- 목록 응답과 상세 응답은 다르게 설계하는 것이 좋다.
- service는 DB 모델을 API 응답 모델로 변환하는 계층이다.
- repository는 화면 요구사항을 몰라도 되고, DB 조회만 담당한다.
- 사용자가 URL을 직접 입력하는 필드는 MVP에 포함하지 않는다.
