# Phase 13. E2E 테스트 정리 하네스

> 기준 단계: `arena_implementation_plan.md`의 Phase 13  
> 선행 단계: Phase 12 관리자 기능 구현 완료  
> 목표: MVP 핵심 정책이 실제 HTTP/API 경계에서 깨지지 않는지 검증하는 backend E2E 테스트 체계를 만든다.

---

## 0. 작성 당시 기준 상태

이 문서는 Phase 13 구현 전 handoff 문서다. 현재 상태를 확인할 때는 `phase13_e2e_test_implementation.md`, `phase14_documentation_cleanup_implementation.md`, `README.md`를 우선한다.

작성 당시 코드 기준:

- 백엔드는 Phase 12까지 구현되어 있다.
- `AdminModule`과 관리자 댓글 API가 `AppModule`에 등록되어 있다.
- 기존 테스트는 `backend/src/**/*.spec.ts` 중심의 unit/controller tests다.
- `backend/test/` 디렉터리와 E2E 전용 Jest config는 아직 없다.
- `package.json`에는 `test:e2e` script가 아직 없다.
- 프론트엔드는 placeholder 상태이므로 Phase 13 범위는 backend HTTP E2E로 한정한다.
- 당시 `project_progress_audit_20260615.md`는 오래된 내용이 있어 README와 Phase 12 구현 문서를 더 최신 기준으로 보도록 안내했다.

먼저 볼 코드:

```text
backend/src/app.module.ts
backend/src/main.ts
backend/src/auth/auth.controller.ts
backend/src/auth/auth.service.ts
backend/src/common/security/csrf.service.ts
backend/src/posts/posts.controller.ts
backend/src/comments/comments.controller.ts
backend/src/ai/rag/rag.controller.ts
backend/src/ai/summary/summary.controller.ts
backend/src/admin/admin-comments.controller.ts
backend/src/database/typeorm.config.ts
```

새로 만들 구조:

```text
backend/test/
  jest-e2e.config.cjs
  helpers/
    e2e-app.ts
    e2e-auth.ts
    e2e-database.ts
    e2e-fixtures.ts
    e2e-mocks.ts
  auth-posts.e2e-spec.ts
  comments-ai-rag.e2e-spec.ts
  summary-admin.e2e-spec.ts
```

추가 script:

```json
{
  "scripts": {
    "test:e2e": "jest --config ./test/jest-e2e.config.cjs --runInBand"
  }
}
```

root `package.json`에도 편의 script를 추가한다.

```json
{
  "scripts": {
    "test:e2e": "pnpm --filter @arena/backend test:e2e"
  }
}
```

---

## 1. 범위와 결정사항

Phase 13은 “기능 추가”가 아니라 “정책형 E2E 안전망 추가”다.

포함:

- backend HTTP endpoint E2E 테스트
- 실제 Nest `AppModule` 부팅
- 실제 PostgreSQL + migrations 사용
- 외부 provider mock 처리
- 인증/CSRF/권한/soft delete/commentCount/AI 상태 정책 검증

제외:

- 프론트엔드 UI 테스트
- Playwright 브라우저 테스트
- 실제 YouTube/OpenAI 네트워크 호출
- Redis/BullMQ/Testcontainers 도입
- seed script 또는 admin 생성 API 추가
- 모든 API의 exhaustive E2E 커버리지

확정 기본값:

- E2E는 실제 PostgreSQL을 사용한다. pgvector/migration/transaction 정책 때문에 SQLite나 in-memory DB를 쓰지 않는다.
- 테스트 DB 이름은 `arena_e2e`를 기본값으로 둔다.
- 테스트 실행 전 Postgres service는 `pnpm.cmd db:up`으로 켜져 있어야 한다.
- E2E는 병렬 실행하지 않는다. 항상 `--runInBand`로 실행한다.
- 각 spec 또는 각 test 전에 DB table을 truncate한다.
- Provider mock은 Nest testing module override로 주입한다.

---

## 2. E2E 테스트 인프라

### Jest config

`backend/test/jest-e2e.config.cjs`를 추가한다.

권장 설정:

```js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/helpers/e2e-timeout.ts'],
};
```

timeout helper는 필요하면 `jest.setTimeout(30000)` 정도로 둔다. 외부 API를 호출하지 않으므로 더 긴 timeout은 필요하지 않다.

### App bootstrap helper

`createE2eApp()` helper는 `main.ts`와 같은 runtime 설정을 적용한다.

필수 적용:

- `cookieParser()`
- global prefix `api/v1`
- `ValidationPipe({ whitelist: true, transform: true })`
- provider overrides

주의:

- `main.ts`를 직접 import해서 서버를 listen하지 않는다.
- `NestFactory.create()`가 아니라 `Test.createTestingModule({ imports: [AppModule] })`로 만든다.
- E2E app은 `app.init()`까지만 수행하고 port listen은 하지 않는다.

### Test DB strategy

`e2e-database.ts` helper 역할:

- `process.env.NODE_ENV = 'test'`
- `process.env.API_PREFIX = '/api/v1'`
- `process.env.WEB_ORIGIN = 'http://localhost:5173'`
- `process.env.JWT_ACCESS_SECRET`, `CSRF_SECRET`에 deterministic test secret 설정
- `process.env.DATABASE_NAME = process.env.E2E_DATABASE_NAME ?? 'arena_e2e'`
- `pg` client로 maintenance DB에 접속해 `arena_e2e` database가 없으면 생성
- Nest app 부팅 후 `DataSource.runMigrations()` 실행
- 각 test 전에 모든 application table을 `TRUNCATE ... RESTART IDENTITY CASCADE` 처리

truncate 대상에서 제외:

- `migrations`
- PostgreSQL system table
- pgvector extension metadata

구현자는 table 목록을 `information_schema.tables`에서 조회해 public schema의 base table만 대상으로 삼는다.

금지:

- 개발 DB `arena`를 무심코 truncate하지 않는다.
- TypeORM `synchronize: true`를 켜지 않는다.
- migration을 건너뛰고 entity metadata 기반으로 schema를 만들지 않는다.

---

## 3. Provider Mock 정책

E2E 테스트는 실제 외부 네트워크와 API key에 의존하지 않는다.

override 대상:

```text
YoutubeMetadataProvider
YoutubeTranscriptProvider
EmbeddingProvider
CommentAnalyzerProvider
SummaryProvider
AgentLlmProvider
```

권장 mock 기본값:

- `YoutubeMetadataProvider.fetchMetadata()`는 고정 metadata를 반환한다.
- `YoutubeTranscriptProvider.fetchTranscript()`는 3~5개 segment를 반환한다.
- `EmbeddingProvider.embedTexts()`는 `EMBEDDING_DIMENSION`과 일치하는 deterministic vector를 반환한다.
- `CommentAnalyzerProvider.analyze()`는 댓글 내용에 따라 deterministic result를 반환한다.
  - `toxic` 또는 `바보` 포함: `TOXIC`, `NEEDS_REVIEW`
  - `fact` 또는 숫자 포함: `FACT_CLAIM`, `NORMAL`
  - `fail-analysis` 포함: `CommentAnalyzerError` throw
  - 그 외: `OPINION`, `NORMAL`
- `SummaryProvider.summarize()`는 `{ summaryText: '테스트 요약' }`을 반환한다.
- `AgentLlmProvider.decide()`는 필요한 spec에서만 final 또는 tool_call decision을 명시적으로 반환한다.

주의:

- mock provider가 raw API key, token, cookie 값을 저장하거나 응답하지 않게 한다.
- async background 작업을 검증할 때는 polling helper를 둔다.
- AI/RAG background completion을 반드시 기다려야 하는 테스트만 `waitFor()`를 사용한다.

---

## 4. Auth/CSRF E2E Helper

로그인 helper는 `supertest.agent(app.getHttpServer())`를 사용해 refresh/csrf cookie를 유지한다.

권장 helper:

```text
signupUser({ email, password, nickname })
loginUser({ email, password })
createSession({ email, password, nickname })
promoteToAdmin(userId)
csrfHeader(session)
authHeader(session)
```

세션 객체:

```ts
type E2eSession = {
  agent: SuperAgentTest;
  userId: string;
  accessToken: string;
  csrfToken: string;
};
```

CSRF 규칙:

- 로그인 응답 body에서 `accessToken`을 저장한다.
- 로그인 응답 body 또는 `arena_csrf_token` cookie에서 `csrfToken`을 저장한다.
- state-changing API는 `Authorization: Bearer <accessToken>`와 `x-csrf-token: <csrfToken>`를 모두 보낸다.
- GET read API는 CSRF header 없이 호출해도 되는지 확인한다.
- CSRF 실패 테스트는 header를 일부러 생략한다.

Admin 승격:

- Phase 13에서는 admin 생성 API를 만들지 않는다.
- `promoteToAdmin(userId)` helper가 DB에서 `users.role = 'ADMIN'`으로 업데이트한다.
- 승격 후에는 다시 login해서 access token payload의 role이 ADMIN이 되게 한다.

---

## 5. 테스트 파일별 시나리오

### `auth-posts.e2e-spec.ts`

검증 목표:

- 인증 기본 흐름
- 게시글 CRUD 권한
- 게시글 카운터 기본 정책
- video status 초기값

필수 시나리오:

1. 회원가입 → 로그인 → `/users/me` 조회가 성공한다.
2. 비회원은 `POST /posts` 작성 시 `401`이다.
3. 로그인 사용자가 `POST /posts`를 호출하면 `201`이고 연결 video의 `metadataStatus`, `transcriptStatus`, `embeddingStatus`가 `PENDING`으로 시작한다.
4. 작성자는 `PATCH /posts/:postId`, `DELETE /posts/:postId`에 성공한다.
5. 다른 사용자는 게시글 수정/삭제 시 `403`이다.
6. `POST /posts/:postId/views` 호출 시 `viewCount`가 증가한다.
7. 같은 사용자의 중복 좋아요는 `409`, 좋아요 취소는 `204`, `likeCount`가 음수가 되지 않는다.
8. state-changing post API에서 CSRF header가 없으면 `403`이다.

### `comments-ai-rag.e2e-spec.ts`

검증 목표:

- 댓글/대댓글 정책
- soft delete placeholder
- commentCount transaction 정책
- AI 분석/RAG 상태 정책

필수 시나리오:

1. 댓글 작성 성공 후 `posts.commentCount`가 1 증가하고 댓글 analysis는 `PENDING`으로 시작한다.
2. 대댓글 작성 성공 후 `commentCount`가 증가한다.
3. 대댓글의 대댓글은 `400`이다.
4. 다른 사용자의 댓글 수정/삭제는 `403`이다.
5. 댓글 삭제 후 root placeholder는 `삭제된 댓글입니다`이고 대댓글은 유지된다.
6. 댓글 삭제 후 `commentCount`가 1 감소하고 중복 삭제는 count를 다시 줄이지 않는다.
7. analyzer mock이 실패하면 댓글은 유지되고 `aiAnalysisStatus=FAILED`가 저장된다.
8. `FACT_CLAIM` 댓글만 RAG가 `PENDING` 또는 최종 상태로 진행된다.
9. `GET /comments/:commentId/evidences`는 별도 endpoint로 근거를 조회하고, 댓글 목록에는 evidence 상세가 포함되지 않는다.

RAG 검증 주의:

- pgvector similarity query가 실제 DB에서 돌 수 있게 migration과 extension이 필요하다.
- deterministic embedding vector를 사용한다.
- threshold 이상 결과가 생기는 케이스와 결과 없음 케이스 중 하나만 먼저 E2E로 고정해도 된다.
- 세부 similarity ranking은 unit test에 맡기고 E2E에서는 endpoint 분리와 상태/노출 정책을 우선 검증한다.

### `summary-admin.e2e-spec.ts`

검증 목표:

- 요약 최소 조건과 공개 조회 정책
- 관리자 API 권한 정책
- 관리자 AI 분석 retry 정책

필수 시나리오:

1. 댓글 수 10개 미만이면 `POST /comments/:rootCommentId/summary`가 `400`이다.
2. 루트 댓글 + 대댓글 9개가 있으면 요약 생성이 `202` 또는 cached `200` 정책대로 동작한다.
3. 비회원은 요약 생성 `401`이지만 기존 요약 조회 `GET`은 가능하다.
4. 일반 사용자는 `GET /admin/comments`에서 `403`이다.
5. 관리자는 `GET /admin/comments?moderationStatus=NEEDS_REVIEW`를 CSRF 없이 조회할 수 있다.
6. 관리자 `DELETE /admin/comments/:commentId`는 CSRF가 없으면 `403`, 있으면 `204`이고 댓글 목록 placeholder가 `관리자에 의해 삭제된 댓글입니다`로 바뀐다.
7. 일반 사용자는 `POST /admin/comments/:commentId/analysis/retry`에서 `403`이다.
8. 관리자는 `FAILED` analysis만 retry할 수 있고 성공 시 `202`, `PENDING`을 반환한다.
9. `FAILED`가 아닌 analysis retry는 `409`이다.

---

## 6. Fixtures

기본 fixture는 작고 반복 가능해야 한다.

권장 데이터:

- user A: 일반 작성자
- user B: 권한 실패 검증용 일반 사용자
- admin: DB 승격 후 재로그인한 관리자
- post 1개
- root comment 1개
- replies 9개
- toxic comment 1개
- failed-analysis comment 1개
- fact-claim comment 1개

fixture 생성은 가능한 한 HTTP API로 한다. 단, 다음은 DB helper로 처리해도 된다.

- admin role 승격
- 특정 analysis 상태를 빠르게 만들기 위한 DB update
- transcript chunk/vector fixture 삽입

원칙:

- 사용자가 실제로 만들 수 있는 리소스는 HTTP API로 만든다.
- 외부/비동기 결과나 운영자-only 상태는 DB helper로 최소 조작한다.
- fixture helper는 password/token/API key를 로그로 출력하지 않는다.

---

## 7. 구현 순서

1. `backend/test/jest-e2e.config.cjs`와 root/backend `test:e2e` script를 추가한다.
2. `e2e-database.ts`로 test DB 생성, migration 실행, truncate helper를 만든다.
3. `e2e-app.ts`로 `AppModule` 부팅과 provider override를 만든다.
4. `e2e-auth.ts`로 signup/login/session/csrf/admin promotion helper를 만든다.
5. `auth-posts.e2e-spec.ts`를 먼저 구현한다.
6. `comments-ai-rag.e2e-spec.ts`를 구현한다.
7. `summary-admin.e2e-spec.ts`를 구현한다.
8. flaky한 background 작업은 polling helper로 안정화한다.
9. README의 확인 명령에 `pnpm.cmd test:e2e`를 추가한다.
10. 완료 후 `docs/implementation/phase13_e2e_test_implementation.md`를 남긴다.

권장 polling helper:

```text
waitFor(assertion, { timeoutMs: 3000, intervalMs: 50 })
```

background 작업이 실패해도 댓글/게시글 생성 자체는 성공해야 한다는 정책을 테스트 이름에 드러낸다.

---

## 8. 수용 기준

Phase 13 완료 기준:

- `backend/test/` E2E 구조가 생긴다.
- `pnpm.cmd test:e2e`로 backend E2E suite를 실행할 수 있다.
- E2E는 실제 PostgreSQL test DB와 migrations를 사용한다.
- E2E는 실제 YouTube/OpenAI 네트워크를 호출하지 않는다.
- 인증/CSRF/권한 실패가 HTTP status 기준으로 검증된다.
- soft delete placeholder, commentCount, duplicate like, 대댓글 제한이 E2E로 검증된다.
- 댓글 AI 분석 실패와 retry 정책이 E2E로 검증된다.
- 요약 최소 댓글 수와 비회원 조회 정책이 E2E로 검증된다.
- 관리자 API는 일반 사용자 `403`, 관리자 success path, CSRF 실패를 모두 검증한다.

최종 검증 명령:

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd test:e2e
pnpm.cmd lint
pnpm.cmd format:check
```

---

## 9. 주의사항

- E2E DB reset은 destructive하므로 반드시 `DATABASE_NAME === 'arena_e2e'` 같은 guard를 둔다.
- 기존 개발 DB를 truncate하는 코드가 되면 안 된다.
- E2E에서 provider mock을 빼먹으면 API key나 network에 의존해 flaky해진다.
- `setTimeout`으로 무작정 기다리지 말고 polling helper를 사용한다.
- response body에 passwordHash, refresh token, raw provider error, stack trace가 없는지도 주요 응답에서 확인한다.
- Phase 13에서 frontend를 같이 시작하지 않는다. 프론트 구현과 브라우저 테스트는 별도 phase로 분리한다.
