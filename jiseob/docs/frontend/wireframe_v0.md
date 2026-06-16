# Wireframe v0

> 목적: 첫 frontend 구현 전에 화면 골격과 검토 포인트를 공유한다.
> 비교 preview: `frontend/preview.html`

---

## 1. Content Plan

| 영역               | 역할                         | 핵심 정보                             |
| ------------------ | ---------------------------- | ------------------------------------- |
| Top navigation     | 서비스 위치와 session action | Arena, 검색, 로그인/작성              |
| Posts index        | 토론 탐색                    | 게시글 목록, tag, count, video status |
| Post detail        | 토론 읽기                    | 영상, 본문, 댓글 thread               |
| Context side panel | 보조 상태                    | video 처리, Agent, summary            |
| Evidence sheet     | 자막 근거 후보               | 구간, similarity, 주의 문구           |
| Admin queue        | 검토 작업                    | NEEDS_REVIEW 댓글, retry/delete       |

---

## 2. Interaction Thesis

- 목록 item hover는 border와 background만 미세하게 바꿔 클릭 가능성을 보여준다.
- Evidence는 inline 확장이 아니라 오른쪽 sheet로 열어 댓글 흐름을 유지한다.
- Agent run은 질문 입력 후 상태 badge와 skeleton으로 기다리는 감각을 만든다.

---

## 3. 게시글 목록 와이어

```text
┌─────────────────────────────────────────────────────────────┐
│ Arena        Search discussions...        Login   New post   │
├─────────────────────────────────────────────────────────────┤
│ All tags  뉴스  경제  과학                                  │
│                                                             │
│ [Post item] title, preview, stats, video status              │
│ [Post item] title, preview, stats, video status              │
│ [Post item] title, preview, stats, video status              │
│                                                             │
│ Pagination                                                   │
└─────────────────────────────────────────────────────────────┘
```

검토 포인트:

- 첫 화면에서 게시판임이 바로 보여야 한다.
- video 처리 상태는 너무 크지 않게 둔다.
- 검색과 tag filter는 목록 위에 놓는다.

---

## 4. 게시글 상세 와이어

```text
┌─────────────────────────────────────────────────────────────┐
│ Top navigation                                               │
├───────────────────────────────────────┬─────────────────────┤
│ Video card                            │ Processing status    │
│ Title, author, tags                   │ Agent question       │
│ Body                                  │ Summary              │
│ Comments thread                       │                     │
│  └ Evidence button                    │                     │
└───────────────────────────────────────┴─────────────────────┘
```

검토 포인트:

- 댓글을 읽는 흐름이 끊기지 않아야 한다.
- Agent는 side panel로 두어 본문 토론을 가리지 않는다.
- 모바일에서는 side panel을 아래로 내리거나 sheet로 전환한다.

---

## 5. 댓글 Thread 와이어

```text
Root comment
  author, time, moderation badge
  content
  analysis badge, evidence count, reply action

  Reply
    author, time
    content
```

정책:

- 최대 depth 2
- 삭제 댓글 placeholder 유지
- evidence 상세는 별도 sheet

---

## 6. Evidence Sheet 와이어

```text
Evidence candidates
Comment excerpt

Candidate 1
  00:12 - 00:20
  transcript text
  similarity 0.84

Notice
  근거 후보는 관련 있을 수 있는 자막 구간이며,
  사실 여부를 최종 판정하지 않습니다.
```

---

## 7. Admin 와이어

```text
Admin comments
Filter: NEEDS_REVIEW

Comment row
  content, author, post, analysis status
  Retry analysis
  Delete
```

관리자 화면은 디자인보다 처리 효율이 우선이다.

---

## 8. 다음 결정 필요

- 로그인/회원가입을 page로 시작할지 dialog로 시작할지
- access token을 memory only로 시작할지
- 게시글 목록에서 video thumbnail을 즉시 보여줄지
- React server cache library를 바로 도입할지
- Admin 화면을 MVP에 포함할 우선순위
