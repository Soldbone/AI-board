# Phase 1 백엔드 초기 설정 정리

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

## 다음 단계 후보

Phase 2에서는 공통 기반을 만든다.

- `BaseModel` 추가
- ULID 생성 방식 정리
- 공통 enum 추가
- 인증/권한 guard의 최소 골격 준비
