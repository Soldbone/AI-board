# Design System

> 목적: Arena frontend를 shadcn/ui 기반으로 구현할 때 시각 기준과 컴포넌트 사용 원칙을 정한다.

---

## 1. Visual Thesis

Arena는 차분한 연구실 같은 토론 도구다. 흰색/neutral surface를 기본으로 하고, 영상과 댓글의 정보 밀도를 유지하되 AI 보조 정보는 작은 상태와 panel로 절제해서 보여준다.

선택된 preview preset:

```text
Arena Neutral
```

React 구현은 `frontend/preview.html`의 `Arena Neutral` 조합을 기준으로 한다. 다른 preset은 비교용으로만 유지한다.

---

## 2. UI 방향

- SaaS 랜딩 페이지가 아니라 작업형 게시판 UI다.
- 첫 화면은 게시글 목록과 검색이 바로 보여야 한다.
- 과한 hero, 장식 gradient, marketing copy를 사용하지 않는다.
- card는 반복 item, modal, sheet, 실제 framed tool에만 사용한다.
- 화면 section 자체를 card처럼 감싸지 않는다.
- radius는 shadcn 기본 `0.5rem`을 유지한다.
- accent는 한 가지 계열만 사용한다.

---

## 3. Token 기준

현재 `frontend/src/styles/globals.css`는 shadcn neutral token을 사용한다.

핵심 token:

```css
--radius: 0.5rem;
--background;
--foreground;
--card;
--muted;
--muted-foreground;
--border;
--primary;
--destructive;
```

초기에는 색상을 추가하지 않고 다음 semantic helper만 CSS class 또는 component variant로 다룬다.

- success
- warning
- info

단, Tailwind theme 확장은 실제 구현 중 필요해질 때 추가한다.

---

## 4. Typography

권장:

- Page title: 24-30px
- Section title: 16-20px
- Body: 14-16px
- Meta/caption: 12-13px

원칙:

- viewport width로 font-size를 직접 scale하지 않는다.
- compact panel 안에서는 hero-scale type을 쓰지 않는다.
- letter spacing은 0을 기본으로 한다.

---

## 5. 컴포넌트 우선순위

가장 먼저 추가할 shadcn/ui:

```text
button
input
textarea
badge
separator
skeleton
dialog
sheet
tabs
dropdown-menu
toast
```

두 번째:

```text
avatar
select
checkbox
tooltip
table
alert
```

사용 기준:

- Evidence 상세: `sheet`
- Login/signup: 초기 route, 이후 `dialog` 검토
- Admin 목록: `table` 또는 dense list
- Agent answer: panel + status badge
- Status hint: `badge`
- 긴 action menu: `dropdown-menu`

---

## 6. 상태 Badge 톤

| Tone        | 용도                    |
| ----------- | ----------------------- |
| default     | 주요 action과 선택 상태 |
| secondary   | 대기/처리 중            |
| outline     | 일반 분석 결과          |
| destructive | 실패/삭제/위험          |
| muted       | 없음/불가               |
| warning     | 검토 필요               |
| success     | 준비됨/근거 있음        |

shadcn 기본 badge variant에 없는 `warning`, `success`, `muted`는 작은 local wrapper로 시작한다.

---

## 7. Layout 기준

Desktop:

```text
top nav
content max width 1180-1280
detail: 2 column
main: minmax(0, 1fr)
side: 320-360px
```

Mobile:

```text
single column
side panel content는 sheet/collapsible
top nav action은 icon button 또는 compact menu
```

목록 item은 8px radius card로 사용 가능하다. 하지만 페이지 전체를 큰 card로 감싸지 않는다.

---

## 8. Accessibility

- form input은 label을 가진다.
- button은 icon만 있을 경우 tooltip 또는 aria-label을 둔다.
- status badge만으로 의미를 전달하지 않고 text도 함께 둔다.
- error는 색상만이 아니라 문구로 설명한다.
- keyboard focus ring은 shadcn token을 유지한다.

---

## 9. Preview 검토 기준

`frontend/preview.html`을 볼 때 확인할 것:

- 게시글 목록이 첫 화면에서 바로 이해되는가
- 상세 화면에서 영상/본문/댓글/AI panel의 우선순위가 맞는가
- AI가 과도하게 주인공처럼 보이지 않는가
- evidence가 "판정"이 아니라 "후보"처럼 보이는가
- admin 화면이 운영 작업용으로 충분히 dense한가
