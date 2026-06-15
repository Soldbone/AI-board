# Frontend Planning

> 기준일: 2026-06-15
> 대상: Arena React/Vite frontend Phase 15 시작 문서

Arena frontend는 backend Phase 14 이후 실제 사용자 화면을 구현하기 위한 별도 phase로 다룬다. 이 폴더의 문서는 디자인 시안, 화면 구조, API 연결, UI 상태 표현을 구현 전에 맞추기 위한 기준이다.

## 문서 목록

- [Frontend Plan](frontend_plan.md): 구현 순서, milestone, 산출물
- [Screen Map](screen_map.md): 화면/route/권한/주요 action
- [UI States](ui_states.md): loading, empty, error, AI/video 상태 표현
- [API Usage](api_usage.md): frontend API client, auth, CSRF, polling 규칙
- [Design System](design_system.md): shadcn/ui 기반 시각 기준과 컴포넌트 우선순위
- [Wireframe v0](wireframe_v0.md): 첫 시안의 화면 구성과 검토 포인트

## 현재 결론

첫 구현은 게시판의 기본 정보 구조를 안정시키는 방향으로 시작한다.

```text
게시글 목록
→ 게시글 상세
→ 인증/세션
→ 게시글 작성
→ 댓글/대댓글
→ AI 상태와 근거 후보
→ Agent 질문
→ Admin 검토 목록
```

AI는 제품의 중심 가치를 돕는 보조 layer이며, UI에서는 참/거짓 판정처럼 보이지 않게 표현한다. 사용자는 "관련 있을 수 있는 자막 구간", "근거 후보", "처리 상태", "한계"를 분리해서 이해할 수 있어야 한다.

## Preview

정적 비교용 preview는 다음 파일에서 확인한다.

```text
frontend/preview.html
```

이 파일은 실제 React 구현이 아니라 shadcn/ui 톤, 화면 밀도, 상태 badge, 댓글 thread, evidence drawer 느낌을 빠르게 검토하기 위한 HTML 산출물이다.
