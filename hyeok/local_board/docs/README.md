# Local Board 문서 목록

이 폴더는 Local Board 프로젝트의 기획, 설계, 구현, 테스트 문서를 모아두는 공간입니다.

## 문서 읽는 순서

| 순서 | 문서 | 목적 |
| --- | --- | --- |
| 0 | [project_plan.md](./project_plan.md) | 프로젝트 기획서 |
| 1 | [01_requirements_spec.md](./01_requirements_spec.md) | 요구사항 정의서 / 기능명세서 |
| 2 | [02_screen_flow.md](./02_screen_flow.md) | 화면설계서 / 사용자 흐름 |
| 3 | [03_api_spec.md](./03_api_spec.md) | API 명세서 |
| 4 | [04_db_design.md](./04_db_design.md) | DB 설계서 |
| 5 | [05_technical_design.md](./05_technical_design.md) | 기술설계서 |
| 6 | [06_ai_design.md](./06_ai_design.md) | RAG / MCP / Agent 설계서 |
| 7 | [07_work_plan.md](./07_work_plan.md) | 작업계획서 / 구현 순서 |
| 8 | [08_test_plan.md](./08_test_plan.md) | 테스트 계획서 |
| 9 | [09_run_deploy_guide.md](./09_run_deploy_guide.md) | 실행 / 배포 가이드 |

## 프로젝트 핵심 흐름

```text
사용자 질문 게시글 작성
→ 댓글로 지역 후기 축적
→ RAG로 비슷한 게시글 탐색
→ Agent가 DB 기반 평가 요약
→ 필요 시 MCP로 외부 장소 검색
→ 사용자에게 평가와 장소 후보 제공
```

## 문서 작성 기준

- 현재 구현된 코드를 기준으로 작성했습니다.
- 발표와 협업에 필요한 수준으로 기능, API, DB, AI 구조를 분리했습니다.
- 세부 구현이 바뀌면 관련 문서를 함께 갱신해야 합니다.
