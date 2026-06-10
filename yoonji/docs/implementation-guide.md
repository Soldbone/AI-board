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
