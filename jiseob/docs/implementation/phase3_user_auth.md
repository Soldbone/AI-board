# Phase 3. User / Auth 구현 정리

> 브랜치: `feature/jiseob/phase3-user-auth`  
> 기준 단계: `arena_implementation_plan.md`의 Phase 3  
> 목표: 로그인 기반 기능을 만들기 위한 사용자 계정, JWT 인증, Refresh Token 세션, CSRF 보호를 구현한다.

---

## 1. 이번 단계에서 추가한 것

### 1-1. 사용자 계정

`users` 테이블과 `User` Entity를 추가했다.

저장하는 핵심 정보는 다음과 같다.

```text
id
email
passwordHash
nickname
role
createdAt
updatedAt
deletedAt
```

의미:

- `id`는 Phase 2에서 만든 `BaseModel`의 ULID를 그대로 사용한다.
- 비밀번호는 평문이 아니라 `bcryptjs` hash로 저장한다.
- `deletedAt`을 사용해 회원탈퇴를 soft delete로 처리한다.
- 응답에는 `passwordHash`를 절대 포함하지 않는다.

---

### 1-2. 인증 세션

`auth_sessions` 테이블과 `AuthSession` Entity를 추가했다.

저장하는 핵심 정보는 다음과 같다.

```text
userId
refreshTokenHash
expiresAt
revokedAt
rotatedAt
userAgent
ipAddress
```

의미:

- Access Token은 JWT라서 짧은 시간 동안 서버 저장소 없이 검증할 수 있다.
- Refresh Token은 길게 살아 있으므로 서버에서 수명과 폐기를 관리해야 한다.
- 그래서 JWT를 쓰더라도 Refresh Token 관리를 위한 `auth_sessions`는 필요하다.
- Refresh Token 원문은 DB에 저장하지 않고 SHA-256 hash만 저장한다.
- 로그아웃, 회원탈퇴, refresh token rotation 시 이 session row를 갱신한다.

이 구조는 순수 stateless JWT가 아니라 다음 형태에 가깝다.

```text
짧은 Access Token: JWT 기반
긴 Refresh Token: DB session 기반
```

---

## 2. 구현된 API

```http
POST   /api/v1/auth/signup
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/csrf
GET    /api/v1/users/me
DELETE /api/v1/users/me
```

### 회원가입

```http
POST /api/v1/auth/signup
```

- 사용자를 생성한다.
- 토큰은 발급하지 않는다.
- 중복 이메일은 `409 Conflict`로 처리한다.

### 로그인

```http
POST /api/v1/auth/login
```

- 이메일과 비밀번호를 검증한다.
- Access Token은 response body로 반환한다.
- Refresh Token은 `arena_refresh_token` httpOnly cookie로 내려준다.
- CSRF Token은 `arena_csrf_token` cookie로 내려준다.

### Refresh

```http
POST /api/v1/auth/refresh
```

- Refresh Token cookie와 CSRF header를 검증한다.
- 성공하면 Access Token을 새로 발급한다.
- Refresh Token도 새 값으로 교체한다.
- 이전 Refresh Token hash는 더 이상 유효하지 않다.

### Logout

```http
POST /api/v1/auth/logout
```

- Access Token과 CSRF Token이 필요하다.
- 현재 session의 `revokedAt`을 기록한다.
- refresh/csrf cookie를 삭제한다.

### 내 정보 조회

```http
GET /api/v1/users/me
```

- Access Token이 필요하다.
- GET 요청이므로 CSRF 검증은 하지 않는다.

### 회원탈퇴

```http
DELETE /api/v1/users/me
```

- Access Token과 CSRF Token이 필요하다.
- 사용자를 soft delete 처리한다.
- 현재 session도 revoke한다.
- 게시글과 댓글은 이후 단계 정책에 따라 유지하고 작성자 표시만 별도 처리할 예정이다.

---

## 3. 확정된 보안 정책

### Access Token

```text
저장 위치: 프론트 JS 메모리
전송 방식: Authorization: Bearer <accessToken>
만료 시간: JWT_ACCESS_EXPIRES_IN, 기본 15m
```

Access Token을 cookie에 넣지 않는 이유는 브라우저가 cross-site 요청에 Authorization header를 자동으로 붙이지 않기 때문이다.

즉 공격 사이트가 form submit을 유도하더라도 우리 프론트 메모리에 있는 Access Token을 읽거나 Authorization header에 자동으로 넣을 수 없다.

단, 우리 사이트에서 XSS가 발생하면 메모리 토큰도 안전하지 않다. 이 문제는 CSP, 입력 escape, React 기본 escaping, 위험한 HTML 삽입 금지로 별도 관리해야 한다.

### Refresh Token

```text
저장 위치: httpOnly Cookie
cookie 이름: arena_refresh_token
cookie path: /api/v1/auth
DB 저장: SHA-256 hash
만료 시간: REFRESH_TOKEN_EXPIRES_IN, 기본 7d
```

Refresh Token은 JS가 읽을 수 없어야 하므로 httpOnly cookie를 사용한다.

cookie path를 `/api/v1/auth`로 둔 이유는 refresh token이 인증 관련 API에만 자동 전송되게 하기 위해서다.

### CSRF

```text
방식: Signed Double Submit Cookie
cookie 이름: arena_csrf_token
요청 header: X-CSRF-Token
서명 방식: HMAC-SHA256(sessionId + "." + nonce)
검증 대상: POST, PATCH, DELETE
제외 대상: GET, HEAD, OPTIONS
```

CSRF Token은 Refresh Token cookie와 달리 JS에서 읽을 수 있어야 한다.

프론트는 `arena_csrf_token` cookie 값을 읽어서 상태 변경 요청의 `X-CSRF-Token` header에 넣는다.

서버는 다음을 확인한다.

```text
1. Origin이 허용된 WEB_ORIGIN인지 확인
2. CSRF cookie와 X-CSRF-Token header 값이 같은지 확인
3. token signature가 현재 sessionId로 만든 값인지 확인
```

이렇게 하면 공격 사이트가 cookie를 자동 전송시키더라도 올바른 header 값을 만들 수 없다.

---

## 4. BaseModel과 이번 작업의 관계

Phase 2에서 만든 `BaseModel`은 이번 단계에서 실제 Entity 기반으로 사용되기 시작했다.

이번에 `User`, `AuthSession`이 `BaseModel`을 상속하면서 다음이 자동으로 적용된다.

```text
id: ULID 자동 생성
createdAt: 생성 시각 자동 기록
updatedAt: 수정 시각 자동 갱신
deletedAt: soft delete 시각 기록
```

즉 Phase 2는 공통 규칙을 만든 단계였고, Phase 3는 그 규칙을 실제 도메인 테이블에 적용한 첫 단계다.

---

## 5. 검증한 내용

실행한 정적 검증:

```bash
pnpm.cmd --filter @arena/backend typecheck
pnpm.cmd --filter @arena/backend build
pnpm.cmd --filter @arena/backend test
pnpm.cmd lint
```

DB 반영:

```bash
pnpm.cmd --filter @arena/backend migration:run
```

실제 API 흐름 검증:

```text
GET /api/v1/health
GET /api/v1/health/db
POST /api/v1/auth/signup
POST /api/v1/auth/login
GET /api/v1/users/me
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
DELETE /api/v1/users/me
```

확인한 보안 케이스:

- 로그인 성공 시 Access Token이 반환된다.
- 로그인 성공 시 refresh/csrf cookie가 발급된다.
- GET `/users/me`는 CSRF 없이 성공한다.
- refresh는 CSRF header가 있어야 성공한다.
- logout 후 refresh는 실패한다.
- DELETE `/users/me`는 CSRF 없이 실패한다.
- DELETE `/users/me`는 CSRF가 있으면 성공한다.
- 탈퇴한 사용자는 다시 로그인할 수 없다.

---

## 6. 현재 진행률

큰 구현 계획 기준으로 보면 현재는 다음 위치다.

```text
Phase 1  Backend setup        [done]
Phase 2  Common foundation    [done]
Phase 3  User / Auth          [done]
Phase 4  Post / Tag / Video   [next]
```

대략적인 전체 진행률:

```text
[######------------------] 25%
```

아직 게시글, 댓글, 영상 처리, AI/RAG/요약, 관리자 기능이 남아 있으므로 전체 서비스 기준으로는 초반 기반 공사가 끝난 상태다.

---

## 7. 다음 단계

다음은 Phase 4 `Post / Tag / Video 기본 구현`이다.

다음 단계에서 구현할 핵심은 다음이다.

```text
POST /api/v1/posts
GET  /api/v1/posts
GET  /api/v1/posts/:postId
PATCH /api/v1/posts/:postId
DELETE /api/v1/posts/:postId
GET /api/v1/tags
GET /api/v1/videos/:videoId
```

Phase 4에서 특히 중요한 결정:

- 게시글 작성은 로그인 사용자만 허용한다.
- 게시글 작성 시 YouTube API를 기다리지 않는다.
- YouTube URL에서 videoId를 추출하고 `videos` row를 생성 또는 재사용한다.
- 영상 metadata/transcript/embedding 상태는 `PENDING`으로 시작한다.
- 게시글 수정에서 `youtubeUrl` 변경은 MVP에서는 막는 방향이 안전하다.
