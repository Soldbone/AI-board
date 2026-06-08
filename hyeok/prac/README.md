# Prac Board

React + FastAPI + PostgreSQL 흐름을 보기 위한 아주 작은 게시판 MVP입니다.

로그인/회원가입 없이 텍스트를 입력하면 게시글이 DB에 저장되고, 목록에 표시됩니다.

## 구조

```text
frontend/
  React 화면
  POST /posts 호출
  GET /posts 호출

backend/
  FastAPI API 서버
  SQLAlchemy Model
  Pydantic Schema

postgres
  posts 테이블
```

## 실행 방법

### 1. PostgreSQL 실행

```bash
docker compose up -d
```

### 2. FastAPI 실행

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

FastAPI 문서는 아래에서 볼 수 있습니다.

```text
http://localhost:8000/docs
```

### 3. React 실행

```bash
cd frontend
npm install
npm run dev
```

React 화면은 아래에서 볼 수 있습니다.

```text
http://localhost:5173
```

## 데이터 흐름

```text
1. React textarea에 글을 입력한다.
2. 등록 버튼을 누른다.
3. React가 FastAPI의 POST /posts API를 호출한다.
4. FastAPI가 SQLAlchemy Model로 Post 객체를 만든다.
5. PostgreSQL posts 테이블에 저장한다.
6. React가 GET /posts API를 다시 호출한다.
7. 저장된 글 목록이 화면에 보인다.
```

## 이 MVP에서 확인할 수 있는 것

- React에서 입력값을 state로 관리하는 방식
- React에서 FastAPI API를 호출하는 방식
- FastAPI Router가 요청을 받는 방식
- Pydantic Schema가 요청/응답 데이터를 검증하는 방식
- SQLAlchemy Model이 DB 테이블과 연결되는 방식
- PostgreSQL에 데이터가 저장되는 흐름

