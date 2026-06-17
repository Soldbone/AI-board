# Phase 1 백엔드 초기 설정 정리

## 현재 단계

전체 구현 흐름에서 현재 위치는 다음과 같다.

```text
Phase 1. 프로젝트 초기 설정: 완료
Phase 2. 공통 기반 구현: 다음 작업
Phase 3. User / Auth 구현: 대기
Phase 4. Post / Tag / Video 기본 구현: 대기
Phase 5 이후. Comment, Video 처리, AI/RAG/요약/Admin: 대기
```

이번 단계는 기능 구현이 아니라, 이후 기능들이 올라갈 실행 기반을 만드는 단계다.

## 작업의 의미

이번 작업의 핵심은 NestJS 백엔드가 PostgreSQL에 연결될 수 있는 기반을 만든 것이다.

아직 회원가입, 로그인, 게시글, 댓글 같은 비즈니스 기능은 구현하지 않았다. 현재 만든 것은 앞으로 Entity, Repository, Service, API가 공통으로 사용할 DB 연결 계층이다.

구현 의미를 나누면 다음과 같다.

- `DatabaseModule`은 DB 연결 책임을 `AppModule`에서 분리한다.
- `typeorm.config.ts`는 TypeORM과 PostgreSQL 연결 설정을 한 곳에서 관리한다.
- `synchronize: false`는 Entity 변경을 DB에 자동 반영하지 않고 migration으로 관리하겠다는 결정이다.
- `/api/v1/health`는 서버 프로세스가 살아 있는지 확인한다.
- `/api/v1/health/db`는 서버가 PostgreSQL에 실제 쿼리를 보낼 수 있는지 확인한다.

따라서 장애 원인을 아래처럼 분리해서 볼 수 있다.

```text
/api/v1/health 성공, /api/v1/health/db 실패
→ NestJS 서버는 살아 있지만 DB 연결에 문제가 있다.

/api/v1/health 실패
→ 서버 실행 자체에 문제가 있다.
```

## 작업 내용

- `feature/jiseob/phase1-backend-setup` 브랜치에서 작업을 시작했다.
- NestJS 백엔드에 `DatabaseModule`을 추가했다.
- TypeORM PostgreSQL 연결 설정을 `src/database/typeorm.config.ts`로 분리했다.
- TypeORM 설정은 `synchronize: false`로 시작한다.
- 기존 `/api/v1/health`는 서버 상태 확인용으로 유지했다.
- `/api/v1/health/db`를 추가해 PostgreSQL 연결을 별도로 확인하도록 했다.

## 구현 파일

- `backend/src/database/database.module.ts`
- `backend/src/database/typeorm.config.ts`
- `backend/src/app.module.ts`
- `backend/src/health.controller.ts`

## 검증 결과

아래 명령이 통과했다.

```bash
pnpm --filter @arena/backend typecheck
pnpm --filter @arena/backend build
```

Docker PostgreSQL 실행 후 아래 응답을 확인했다.

```http
GET /api/v1/health
GET /api/v1/health/db
```

두 엔드포인트 모두 `status: "ok"`를 반환했다.

## 알아야 할 핵심

- `synchronize: false`는 Entity 변경이 DB에 자동 반영되지 않는다는 뜻이다. 이후 테이블을 만들 때는 migration을 사용해야 한다.
- `/api/v1/health`는 서버 생존 확인, `/api/v1/health/db`는 DB 연결 확인으로 책임을 분리했다.
- 현재 DB 연결 기본값은 루트 `.env.example`의 `DATABASE_*` 값과 맞춘다.
- 기존 Docker volume에 다른 비밀번호가 남아 있으면 DB 인증이 실패할 수 있다. 이번 검증에서는 `arena` 계정 비밀번호를 개발 기본값인 `arena_dev_password`로 맞췄다.

## 아직 하지 않은 것

이번 단계에서는 아래 작업을 하지 않았다.

- User Entity 생성
- Auth 구현
- 회원가입 / 로그인 API 구현
- 게시글 / 댓글 API 구현
- migration 작성
- 실제 애플리케이션 테이블 생성

이 작업들은 Phase 2 이후 순서대로 진행한다.

## 다음 구현 범위

Phase 2에서는 공통 기반을 만든다.

- `BaseModel` 추가
- ULID 생성 방식 정리
- 공통 enum 추가
- 인증/권한 guard의 최소 골격 준비

다음 작업은 `feature/jiseob/phase2-common-foundation` 같은 브랜치에서 진행하는 것이 적절하다.

권장 커밋 단위는 다음과 같다.

```text
feat: 공통 BaseModel 추가
feat: 공통 상태 enum 추가
chore: 2단계 공통 기반 정리
```

Phase 2에서 너무 멀리 가지 않기 위해 User/Auth의 실제 비즈니스 로직은 시작하지 않는다. Guard도 실제 인증 검증보다는 이후 Auth 구현에서 사용할 구조를 잡는 수준으로 제한한다.
