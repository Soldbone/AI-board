# Phase 13. E2E 테스트 하네스 구현 결과

> 구현 기준: `phase13_e2e_test_harness.md`  
> 구현 범위: backend HTTP E2E 테스트 인프라, provider mock, 정책형 E2E spec  
> 제외 범위: frontend UI 테스트, 실제 YouTube/OpenAI 네트워크 호출

## 1. 구현 요약

Phase 13에서는 백엔드 MVP 정책이 실제 HTTP 경계에서 깨지지 않도록 `backend/test/` E2E 하네스를 추가했다.

추가 구조:

```text
backend/test/
  jest-e2e.config.cjs
  helpers/
    e2e-app.ts
    e2e-auth.ts
    e2e-database.ts
    e2e-env.ts
    e2e-fixtures.ts
    e2e-mocks.ts
    e2e-timeout.ts
  auth-posts.e2e-spec.ts
  comments-ai-rag.e2e-spec.ts
  summary-admin.e2e-spec.ts
```

E2E는 실제 `AppModule`을 부팅하고, `arena_e2e` PostgreSQL DB에 migration을 실행한 뒤 각 테스트 전에 application table을 truncate한다. YouTube/OpenAI/LangChain provider는 Nest testing module override로 deterministic mock을 주입한다.

## 2. 구현 결정

- E2E DB 이름은 기본 `arena_e2e`이며, truncate helper는 `NODE_ENV=test`와 `arena_e2e` 계열 DB 이름일 때만 동작한다.
- TypeORM migration glob은 Jest/ts-jest 환경에서 `src/database/migrations/*.ts`를 보도록 보정했다.
- 로그인 응답 body에는 CSRF token이 없으므로 `arena_csrf_token` cookie에서 읽어 state-changing API에 `x-csrf-token`으로 보낸다.
- 게시글 생성 직후 video status `PENDING` 검증을 안정화하기 위해 video provider mock은 기본적으로 resolve하지 않는다.
- RAG 성공 검증은 video status와 transcript chunk/vector fixture만 DB로 보정하고, 실제 pgvector similarity query를 통과시킨다.

## 3. 검증 범위

- 인증: signup, login, `/users/me`, secret field 비노출
- 게시글: 비회원 작성 실패, 생성 시 video `PENDING`, 작성자 권한, 조회수, 좋아요 중복/취소, CSRF 실패
- 댓글: 댓글/대댓글 작성, depth 제한, 권한 실패, soft delete placeholder, `commentCount`
- AI/RAG: 분석 실패 시 댓글 유지, `FACT_CLAIM`만 RAG, evidence 상세 endpoint 분리
- 요약: 10개 미만 실패, 10개 이상 생성, 비회원 생성 차단과 기존 요약 조회 허용
- 관리자: 일반 사용자 403, admin GET CSRF 불필요, DELETE CSRF 필요, 실패 분석 retry, non-failed retry 409

## 4. 실행 명령

PostgreSQL이 켜진 상태에서 실행한다.

```powershell
pnpm.cmd db:up
pnpm.cmd test:e2e
```

최종 검증 기준:

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd test:e2e
pnpm.cmd lint
pnpm.cmd format:check
```
