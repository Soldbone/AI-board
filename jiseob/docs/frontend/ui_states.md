# UI States

> 목적: Arena frontend에서 backend 상태값을 사용자에게 일관되게 보여준다.

---

## 1. 공통 상태

| 상태         | UI                       | 문구 기준                  |
| ------------ | ------------------------ | -------------------------- |
| Loading      | skeleton                 | 데이터를 불러오는 중       |
| Empty        | muted surface            | 아직 항목이 없음           |
| Error        | destructive text + retry | 실패 사유와 재시도         |
| Unauthorized | sign-in action           | 로그인이 필요함            |
| Forbidden    | static notice            | 권한이 없음                |
| Not found    | static notice            | 삭제되었거나 존재하지 않음 |

목록 화면은 loading, empty, error를 모두 가진다.

---

## 2. Video 상태

대상:

- `metadataStatus`
- `transcriptStatus`
- `embeddingStatus`

| Backend         | Badge tone         | 사용자 문구    |
| --------------- | ------------------ | -------------- |
| `PENDING`       | secondary          | 대기 중        |
| `PROCESSING`    | secondary animated | 처리 중        |
| `SUCCESS`       | success            | 준비됨         |
| `FAILED`        | destructive        | 실패           |
| `NOT_AVAILABLE` | muted              | 사용할 수 없음 |

상태 설명은 video panel에서만 자세히 보여주고, 게시글 목록에서는 badge만 보여준다.

---

## 3. AI 댓글 분석 상태

| Backend        | Badge tone         | 사용자 문구 |
| -------------- | ------------------ | ----------- |
| `PENDING`      | secondary          | 분석 대기   |
| `PROCESSING`   | secondary animated | 분석 중     |
| `SUCCESS`      | outline            | 분석됨      |
| `FAILED`       | destructive        | 분석 실패   |
| `NOT_REQUIRED` | muted              | 분석 없음   |

댓글 type은 보조 badge로 표시한다.

권장 label:

- `FACT_CLAIM`: 사실 주장
- `OPINION`: 의견
- `QUESTION`: 질문
- `TOXIC`: 검토 필요
- unknown: 분류 없음

---

## 4. Moderation 상태

| Backend            | Badge tone  | 사용자 문구 |
| ------------------ | ----------- | ----------- |
| `NORMAL`           | outline     | 정상        |
| `NEEDS_REVIEW`     | warning     | 검토 필요   |
| `DELETED_BY_ADMIN` | destructive | 관리자 삭제 |

일반 사용자 화면에서는 `NORMAL` badge를 과하게 노출하지 않는다. `NEEDS_REVIEW` 또는 삭제 상태처럼 의미 있는 경우만 우선 표시한다.

---

## 5. RAG 상태

| Backend        | Badge tone         | 사용자 문구       |
| -------------- | ------------------ | ----------------- |
| `PENDING`      | secondary          | 근거 후보 준비 중 |
| `PROCESSING`   | secondary animated | 자막 검색 중      |
| `SUCCESS`      | success            | 근거 후보 있음    |
| `NO_RESULT`    | muted              | 관련 구간 없음    |
| `FAILED`       | destructive        | 근거 후보 실패    |
| `NOT_REQUIRED` | muted              | 근거 후보 없음    |

주의 문구:

```text
근거 후보는 관련 있을 수 있는 자막 구간이며, 사실 여부를 최종 판정하지 않습니다.
```

---

## 6. Summary 상태

| Backend      | UI                   |
| ------------ | -------------------- |
| `PENDING`    | 생성 대기            |
| `PROCESSING` | 요약 중              |
| `SUCCESS`    | 요약 본문 표시       |
| `FAILED`     | 실패와 재시도 action |

요약 불가 조건:

```text
요약할 댓글이 충분하지 않습니다.
```

Stale 상태:

```text
새 댓글이 추가되어 요약이 최신 상태가 아닐 수 있습니다.
```

---

## 7. Agent Run 상태

| Backend   | UI                         |
| --------- | -------------------------- |
| `PENDING` | 질문 접수                  |
| `RUNNING` | 근거 후보 확인 중          |
| `SUCCESS` | 답변, 사용 tool, 한계 표시 |
| `FAILED`  | 실패 메시지와 다시 시도    |

Polling:

- 생성 직후 1초 간격으로 시작한다.
- 30초 이후에는 3초 간격으로 늘린다.
- 90초가 지나면 사용자가 수동 재조회하도록 한다.

---

## 8. Toast 기준

성공:

- 게시글이 생성되었습니다. 영상 처리는 잠시 걸릴 수 있습니다.
- 댓글이 등록되었습니다. AI 분석은 별도로 진행됩니다.
- 요약 요청이 접수되었습니다.

실패:

- 로그인이 필요합니다.
- 권한이 없습니다.
- CSRF token이 만료되었습니다. 다시 시도해 주세요.
- 요청을 처리하지 못했습니다.

Toast에는 raw provider error, token, cookie 값을 노출하지 않는다.
