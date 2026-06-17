# Phase 2 공통 기반 구현 정리

## 현재 단계

전체 구현 흐름에서 현재 위치는 다음과 같다.

```text
Phase 1. 프로젝트 초기 설정: 완료
Phase 2. 공통 기반 구현: 완료
Phase 3. User / Auth 구현: 다음 작업
Phase 4. Post / Tag / Video 기본 구현: 대기
Phase 5 이후. Comment, Video 처리, AI/RAG/요약/Admin: 대기
```

대략적인 전체 진행률은 14% 정도로 본다. Phase 1과 Phase 2는 기능 구현보다 기반 작업이므로, Phase 수 기준보다 실제 MVP 작업량 기준으로 낮게 잡는다.

```text
Arena MVP Progress

[#######-------------------------------------------] 14%
```

## 작업의 의미

이번 작업은 이후 도메인 Entity와 인증/권한 기능이 공통으로 사용할 기반을 만든 것이다.

아직 회원가입, 로그인, JWT 발급, 사용자 조회 같은 실제 인증 기능은 구현하지 않았다. Phase 2의 목표는 Phase 3에서 User/Auth를 구현할 때 중복 없이 사용할 수 있는 공통 타입, 상태값, guard/decorator 구조를 준비하는 것이다.

구현 의미를 나누면 다음과 같다.

- `BaseModel`은 주요 Entity가 공통으로 사용할 ULID primary key와 시간 컬럼을 제공한다.
- 공통 enum은 상태값 문자열이 도메인별 파일에 흩어지지 않도록 중앙에서 관리한다.
- `Roles`, `CurrentUser` decorator는 controller에서 인증 사용자와 권한 정보를 꺼내는 표준 인터페이스를 제공한다.
- `JwtAuthGuard`, `RolesGuard`는 Phase 3 Auth 구현에서 실제 JWT strategy와 연결될 골격이다.
- `CommonModule`은 공통 guard를 명시적으로 제공하되, 전역 모듈로 만들지는 않았다.

## 작업 내용

- `feature/jiseob/phase2-common-foundation` 브랜치에서 작업을 시작했다.
- `BaseModel`을 추가해 ULID 기반 Entity 공통 필드를 정의했다.
- User, Video, Comment, AI/RAG/Summary 관련 공통 enum을 추가했다.
- `Roles`와 `CurrentUser` decorator를 추가했다.
- `JwtAuthGuard`와 `RolesGuard` 골격을 추가했다.
- `CommonModule`을 추가하고 `AppModule`에 명시적으로 연결했다.

## 구현 파일

- `backend/src/common/common.module.ts`
- `backend/src/common/entities/base.entity.ts`
- `backend/src/common/enums/*.ts`
- `backend/src/common/decorators/*.ts`
- `backend/src/common/guards/*.ts`
- `backend/src/app.module.ts`

## 알아야 할 핵심

- `BaseModel`은 DB 테이블을 만들지 않는다. 실제 Entity가 이를 상속하고 migration을 만들 때 테이블에 반영된다.
- enum은 DB enum이 아니라 TypeScript enum이다. MVP에서는 DB migration 부담을 줄이기 위해 varchar 컬럼과 application enum 조합을 우선한다.
- `JwtAuthGuard`는 아직 JWT를 검증하지 못한다. Phase 3에서 `JwtStrategy`가 추가되어야 실제로 동작한다.
- `RolesGuard`는 request user의 role을 읽는 구조만 갖췄다. request user를 채우는 책임은 Phase 3 Auth 구현에 있다.

## 아직 하지 않은 것

이번 단계에서는 아래 작업을 하지 않았다.

- User Entity 생성
- 회원가입 / 로그인 API 구현
- 비밀번호 해시 처리
- JWT 발급 및 검증 strategy 구현
- 실제 DB migration 작성
- 게시글 / 댓글 도메인 구현

## 다음 구현 범위

Phase 3에서는 User / Auth를 구현한다.

- User Entity 작성
- 회원가입 DTO 작성
- 비밀번호 해시 처리
- 로그인 구현
- JWT 발급
- JwtStrategy 구현
- 내 정보 조회
- 회원탈퇴 soft delete

권장 브랜치 이름은 `feature/jiseob/phase3-user-auth`다.
