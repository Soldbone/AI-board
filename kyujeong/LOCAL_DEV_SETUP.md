# 로컬 개발 환경 세팅 순서

이 문서는 다른 사람이 `dev` 브랜치를 받아서 냉장고 한 끼 게시판을 로컬에서 실행하기 위한 순서입니다.

## 1. 미리 설치해야 하는 것

- Git
- Docker Desktop
- Node.js 20 이상
- npm

PostgreSQL은 직접 설치하지 않아도 됩니다. 이 프로젝트는 `docker-compose.yml`로 `pgvector`가 포함된 PostgreSQL 컨테이너를 띄웁니다.

## 2. dev 브랜치 받기

처음 받는 경우:

```bash
git clone <repository-url>
cd kyujeong
git checkout dev
```

이미 저장소가 있는 경우:

```bash
git fetch origin
git checkout dev
git pull origin dev
```

작업자가 현재 기능 브랜치를 `dev`로 올릴 때는 아래처럼 올릴 수 있습니다.

```bash
git push origin HEAD:dev
```

## 3. 백엔드 환경변수 만들기

`backend/.env.example`을 복사해서 `backend/.env`를 만듭니다.

```bash
cd backend
copy .env.example .env
```

macOS/Linux라면:

```bash
cp .env.example .env
```

`backend/.env`에서 최소한 아래 값은 로컬 DB 기준으로 맞춰야 합니다.

```env
DATABASE_URL="postgresql://user:0000@localhost:5432/aiboard"
JWT_SECRET="local-dev-secret"
PORT=3000
```

AI 추천과 영양성분 근거까지 제대로 확인하려면 아래 키도 채웁니다.

```env
OPENAI_API_KEY=""
PUBLIC_DATA_FOOD_API_KEY=""
RAW_MATERIAL_NUTRITION_API_KEY=""
STANDARD_FOOD_COMPOSITION_API_KEY=""
```

키가 없어도 서버는 실행됩니다. 다만 동작 범위가 달라집니다.

- `OPENAI_API_KEY` 없음: 로컬 fallback 추천 모드로 동작
- 공공데이터 키 없음: 영양성분 조회 결과가 제한되거나 `확인 불가`로 표시될 수 있음
- `RAW_MATERIAL_NUTRITION_API_KEY`: 원재료성 식품 영양성분 1순위 조회에 사용
- `PUBLIC_DATA_FOOD_API_KEY`: 기존 식품영양성분 API 및 raw-material fallback에 사용
- `STANDARD_FOOD_COMPOSITION_API_KEY`: 국가표준식품성분표 API 조회에 사용

`.env` 파일은 개인 키가 들어가므로 Git에 올리면 안 됩니다.

## 4. DB 컨테이너 실행

프로젝트 루트에서 실행합니다.

```bash
cd ..
docker compose up -d
```

정상 실행 확인:

```bash
docker ps
```

`ai-board-postgres` 컨테이너가 떠 있으면 됩니다.

## 5. 백엔드 의존성 설치

```bash
cd backend
npm install
```

## 6. Prisma 마이그레이션 적용

```bash
npx prisma migrate dev
npx prisma generate
```

이 단계에서 `vector` 확장이 필요합니다. 반드시 루트의 `docker-compose.yml`로 띄운 `pgvector/pgvector:pg16` 이미지를 사용하세요.

## 7. 데모 게시글 데이터 넣기

AI 요리사가 참고할 게시판 글이 있어야 RAG 추천 흐름을 확인할 수 있습니다.

```bash
npm run seed:board-rag
```

이 시드는 데모 사용자, 게시글, 댓글, 태그를 넣습니다.

## 8. 백엔드 실행

```bash
npm run start:dev
```

백엔드는 기본적으로 아래 주소에서 실행됩니다.

```text
http://localhost:3000
```

AI 설정 상태를 확인하고 싶으면 다른 터미널에서 실행합니다.

```bash
npm run ai:check
```

국가표준식품성분 API 연결을 따로 확인하려면:

```bash
npm run mcp:standard-food:check
```

## 9. 프론트엔드 의존성 설치

새 터미널을 열고 프로젝트 루트 기준으로 실행합니다.

```bash
cd frontend
npm install
```

## 10. 프론트엔드 실행

```bash
npm run dev
```

브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:5173
```

프론트엔드는 `/api` 요청을 자동으로 `http://localhost:3000` 백엔드로 프록시합니다.

## 11. 실행 확인 순서

1. 회원가입
2. 로그인
3. 게시판 목록 확인
4. 글쓰기
5. 질문 게시글에서 AI 추천 실행
6. 우측 하단 `AI 요리사` 채팅 열기
7. 예시 입력:

```text
메인재료: 또띠아 부재료: 햄, 치즈, 당근, 오이, 양상추
```

참고할 게시글이 있으면 게시글 근거가 표시됩니다.
참고할 게시글이 없으면 질문글 작성으로 유도됩니다.

## 12. 자주 막히는 문제

### DB 연결 실패

`backend/.env`의 `DATABASE_URL`이 아래와 같은지 확인합니다.

```env
DATABASE_URL="postgresql://user:0000@localhost:5432/aiboard"
```

그리고 DB 컨테이너가 떠 있는지 확인합니다.

```bash
docker ps
```

### 5432 포트 충돌

이미 로컬 PostgreSQL이 5432를 쓰고 있으면 Docker 컨테이너가 뜨지 않을 수 있습니다.
그 경우 기존 PostgreSQL을 끄거나 `docker-compose.yml`의 포트를 바꿔야 합니다.

예:

```yaml
ports:
  - "5433:5432"
```

이렇게 바꾸면 `.env`도 같이 바꿔야 합니다.

```env
DATABASE_URL="postgresql://user:0000@localhost:5433/aiboard"
```

### Prisma migrate에서 vector 관련 오류

일반 PostgreSQL 이미지가 아니라 `pgvector/pgvector:pg16` 이미지를 써야 합니다.
루트의 `docker-compose.yml`로 DB를 띄웠는지 확인하세요.

### 공공데이터 API가 Unauthorized 또는 빈 결과를 반환

공공데이터포털 키는 발급 직후 바로 안 될 수 있습니다.
또한 API마다 활용 신청이 별도로 승인되어 있어야 합니다.

확인할 것:

- 키가 `backend/.env`에 들어갔는지
- 해당 API 활용 신청이 승인 상태인지
- Encoding/Decoding 키 중 실제 호출에 성공하는 키를 넣었는지
- `RAW_MATERIAL_NUTRITION_API_KEY`, `PUBLIC_DATA_FOOD_API_KEY`, `STANDARD_FOOD_COMPOSITION_API_KEY`가 필요한 API별로 채워졌는지

### OpenAI 키 없이 AI 추천이 되나요?

됩니다. 다만 fallback 모드라 추천 품질과 임베딩 검색 품질이 제한될 수 있습니다.
실제 OpenAI 기반 추천을 보려면 `OPENAI_API_KEY`를 넣어야 합니다.

### 프론트에서 API 요청이 실패함

백엔드가 먼저 켜져 있어야 합니다.

- 백엔드: `http://localhost:3000`
- 프론트: `http://localhost:5173`

프론트 Vite 서버는 `/api`를 백엔드로 프록시합니다.

## 13. 최소 실행 명령어 요약

터미널 1:

```bash
docker compose up -d
cd backend
npm install
npx prisma migrate dev
npm run seed:board-rag
npm run start:dev
```

터미널 2:

```bash
cd frontend
npm install
npm run dev
```

접속:

```text
http://localhost:5173
```
