# 작업계획서 / 구현 순서

## 1. 문서 목적

이 문서는 Local Board를 구현할 때의 작업 순서, 브랜치 전략, 커밋 단위, 역할 분담 기준을 정리합니다.

## 2. 작업 원칙

| 원칙 | 설명 |
| --- | --- |
| 백엔드 우선 | DB와 API가 안정되어야 프론트 연동이 쉬움 |
| 작은 단위 구현 | 기능을 작게 나누고 단계별로 테스트 |
| API 문서 확인 | FastAPI `/docs`에서 먼저 API 동작 확인 |
| 프론트 연동 | API가 동작한 뒤 화면 연결 |
| AI 기능은 후순위 | 기본 게시판 기능 완성 후 RAG/MCP/Agent 적용 |

## 3. 브랜치 전략

| 브랜치 | 용도 |
| --- | --- |
| main | 최종 제출 또는 안정 버전 |
| develop | 개발 통합 브랜치 |
| feature/hyeok/* | 개인 기능 개발 |
| fix/hyeok/* | 버그 수정 |
| docs/hyeok/* | 문서 작업 |

## 4. 커밋 규칙

형식:

```text
type: 작업 내용
```

예:

```text
feat: 게시글 작성 API 구현
fix: RAG 가게명 필터 오류 수정
docs: 프로젝트 기능명세서 추가
chore: 실제 가게 테스트데이터 seed 추가
```

## 5. 전체 구현 순서

### 5.1 프로젝트 기반

| 순서 | 작업 | 산출물 |
| --- | --- | --- |
| B01 | 프로젝트 폴더 구조 생성 | backend, frontend, docs |
| B02 | Docker PostgreSQL 설정 | docker-compose.yml |
| B03 | FastAPI 기본 서버 생성 | main.py |
| B04 | DB 연결 설정 | database.py, config.py |
| B05 | 공통 Base, Session 설정 | get_db |

### 5.2 인증

| 순서 | 작업 | 산출물 |
| --- | --- | --- |
| A01 | User SQLAlchemy 모델 | models/user.py |
| A02 | User/Auth Pydantic 스키마 | schemas/user.py, schemas/auth.py |
| A03 | 비밀번호 해싱 | core/security.py |
| A04 | 회원가입 API | POST /auth/signup |
| A05 | 로그인 API | POST /auth/login |
| A06 | 현재 사용자 조회 | GET /auth/me |
| A07 | 내 정보 수정 | PATCH /users/me |

### 5.3 게시글

| 순서 | 작업 | 산출물 |
| --- | --- | --- |
| P01 | Post 모델 | models/post.py |
| P02 | Post 스키마 | schemas/post.py |
| P03 | 게시글 작성 API | POST /posts |
| P04 | 게시글 목록 API | GET /posts |
| P05 | 게시글 상세 API | GET /posts/{id} |
| P06 | 게시글 수정 API | PATCH /posts/{id} |
| P07 | 게시글 삭제 API | DELETE /posts/{id} |
| P08 | 검색/페이징/정렬 | keyword, page, sort |

### 5.4 댓글

| 순서 | 작업 | 산출물 |
| --- | --- | --- |
| C01 | Comment 모델 | models/comment.py |
| C02 | Comment 스키마 | schemas/comment.py |
| C03 | 댓글 작성 API | POST /posts/{id}/comments |
| C04 | 댓글 목록 API | GET /posts/{id}/comments |
| C05 | 대댓글 처리 | parent_id |
| C06 | 댓글 삭제 정책 | 삭제 표시 |

### 5.5 태그

| 순서 | 작업 | 산출물 |
| --- | --- | --- |
| T01 | Tag 모델 | models/tag.py |
| T02 | post_tags 연결 테이블 | N:M 관계 |
| T03 | 게시글 작성 시 태그 연결 | posts router |
| T04 | 태그 목록 조회 | GET /tags |
| T05 | 태그 검색 | GET /posts?tag= |
| T06 | 태그 추천 | GET /tags/suggestions |

### 5.6 프론트엔드

| 순서 | 작업 | 산출물 |
| --- | --- | --- |
| F01 | Vite React TS 프로젝트 생성 | frontend |
| F02 | API client 작성 | src/api |
| F03 | 로그인/회원가입 화면 | LoginPage, SignupPage |
| F04 | 게시글 목록 화면 | PostListPage |
| F05 | 게시글 작성/수정 화면 | PostFormPage |
| F06 | 게시글 상세/댓글 화면 | PostDetailPage |
| F07 | 마이페이지 | MyPage |
| F08 | Tailwind 스타일 정리 | index.css, className |

### 5.7 RAG

| 순서 | 작업 | 산출물 |
| --- | --- | --- |
| R01 | 키워드 추출 | extract_keywords |
| R02 | 불용어 제거 | STOPWORDS |
| R03 | Kiwi 명사 추출 연결 | kiwipiepy |
| R04 | 필드별 가중치 | FIELD_WEIGHTS |
| R05 | 유사 게시글 API | /ai/similar-posts |
| R06 | 가게명 우선 필터 | store_name filter |
| R07 | 상세/작성 화면 연결 | getSimilarPosts |

### 5.8 MCP

| 순서 | 작업 | 산출물 |
| --- | --- | --- |
| M01 | MCP 서버 폴더 생성 | mcp_server |
| M02 | 환경변수 설정 | mcp_server/.env |
| M03 | 네이버 지역검색 클라이언트 | naver_client.py |
| M04 | MCP tool 구현 | server.py |
| M05 | 백엔드 MCP client | mcp_client_service.py |
| M06 | 장소 검색 API | /ai/place-search |

### 5.9 Agent

| 순서 | 작업 | 산출물 |
| --- | --- | --- |
| AG01 | Agent 스키마 | schemas/agent.py |
| AG02 | LangChain Agent 생성 | agent_service.py |
| AG03 | MCP tool 연결 | MultiServerMCPClient |
| AG04 | RAG context 연결 | build_agent_rag_context |
| AG05 | DB 기반 평가 요약 | local_review_summary |
| AG06 | fallback 처리 | MCP direct fallback |
| AG07 | 프론트 AI 추천 UI | PostDetailPage |

## 6. QA 작업 순서

| 순서 | 작업 |
| --- | --- |
| Q01 | 회원가입/로그인 확인 |
| Q02 | 게시글 CRUD 확인 |
| Q03 | 댓글/대댓글/삭제 확인 |
| Q04 | 검색/태그/페이징 확인 |
| Q05 | RAG 비슷한 게시글 확인 |
| Q06 | AI 장소 추천 확인 |
| Q07 | 권한 오류 메시지 확인 |
| Q08 | README 실행 방법 확인 |

## 7. 발표 준비 순서

| 순서 | 작업 |
| --- | --- |
| D01 | 실제 가게 테스트데이터 생성 |
| D02 | 시연 계정 준비 |
| D03 | 시연 게시글 선정 |
| D04 | RAG/Agent/MCP 흐름 설명 준비 |
| D05 | 발표 자료에 아키텍처 다이어그램 추가 |
| D06 | 예상 질문 답변 준비 |
