# MCP Product Enrichment Design

이 문서는 후기 게시글에 굿스마일 컴퍼니 코리아 네이버 스마트스토어의 공식 상품 정보를 보강하는 MCP 확장 기능 설계를 정리한다.

MCP 기능은 사용자가 URL을 직접 입력하는 링크 미리보기 기능이 아니다. 후기 게시글의 피규어 정보, 제조사, 태그, 제목을 바탕으로 네이버 쇼핑 검색 API에서 후보를 찾고, 공식 스마트스토어 URL만 남긴 뒤 백엔드가 다시 엄격하게 검증한다.

## 1. 목표와 비목표

### 목표

- REVIEW 게시글 상세에서 공식 판매 정보 후보를 조회한다.
- 네이버 쇼핑 검색 API를 1차 데이터 소스로 사용한다.
- `https://smartstore.naver.com/gsc_korea_dt_bh/...` URL만 공식 후보로 인정한다.
- 후보가 있더라도 피규어명, 상품 라인, 작품/시리즈, 제조사, 가격대 근거가 부족하면 자동 확정하지 않는다.
- 외부 상품 정보는 사용자 게시글, 댓글, `AiOutput`과 분리해 `McpProductEnrichment`에 저장한다.
- 캐시 TTL 안에서는 외부 MCP와 네이버 API를 다시 호출하지 않는다.

### 비목표

- 사용자가 게시글 작성 시 URL을 직접 입력하는 기능은 만들지 않는다.
- `external_urls`, `link_preview_ids`, 사용자가 직접 호출하는 `POST /link-previews`는 만들지 않는다.
- 공식 상품 후보를 사용자 댓글이나 AI 답변으로 저장하지 않는다.
- 공식 스마트스토어가 아닌 쇼핑몰 상품을 공식 정보처럼 표시하지 않는다.

## 2. 전체 구조

```text
REVIEW 게시글
→ FastAPI product_enrichment_service
→ backend MCP client
→ MCP server Streamable HTTP
→ search_gsc_smartstore_products tool
→ Naver Shopping Search API
→ 공식 스마트스토어 URL 후보만 반환
→ backend matching.py에서 재검증
→ McpProductEnrichment 저장
→ 후기 상세 ProductInfoCard 표시
```

역할 분리는 다음과 같다.

- MCP server: 외부 API와 metadata fetch를 안전하게 tool로 노출한다.
- MCP tool: 네이버 검색, whitelist 필터링, metadata 수집을 수행한다.
- Backend MCP client: MCP JSON-RPC 호출만 담당한다.
- Backend matching service: MCP 결과를 그대로 믿지 않고 서비스 정책으로 재검증한다.
- Repository: `McpProductEnrichment` 저장과 조회를 담당한다.
- API route: 요청을 받고 service를 호출하는 얇은 계층이다.
- Frontend: REVIEW 상세에서 상태별 UI를 표시한다.

## 3. 파일 구조

```text
mcp-server/
  main.py
  server.py
  clients/
    http_client.py
    naver_shopping_client.py
  schemas/
    tool_schema.py
  tools/
    shopping_metadata_tool.py

backend/app/
  mcp/
    client.py
    normalizer.py
    matching.py
  models/
    mcp_product_enrichment.py
    enums.py
  repositories/
    product_enrichment_repository.py
  schemas/
    product_enrichment_schema.py
  services/
    product_enrichment_service.py
  api/routes/
    posts.py

frontend/src/
  api/productEnrichmentApi.js
  components/product/ProductInfoCard.jsx
```

## 4. 환경변수

MCP 서버와 백엔드는 환경변수로 연결한다.

```text
MCP_SERVER_URL=http://127.0.0.1:8765/mcp
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
GSC_SMARTSTORE_CHANNEL=gsc_korea_dt_bh
PRODUCT_ENRICHMENT_CACHE_TTL_HOURS=24
```

`NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`은 MCP 서버가 네이버 쇼핑 검색 API를 호출할 때 사용한다. 백엔드는 `MCP_SERVER_URL`로 MCP 서버에 접근한다.

## 5. MCP tools

### search_gsc_smartstore_products

입력:

```json
{
  "query": "넨도로이드 하츠네 미쿠",
  "display": 10,
  "sort": "sim"
}
```

동작:

- 네이버 쇼핑 검색 API를 호출한다.
- `link`가 공식 스마트스토어 URL인지 확인한다.
- 공식 URL이 아닌 후보는 버린다.
- 상품명 HTML 태그를 제거하고 공백을 정리한다.
- `title`, `link`, `image`, `lprice`, `hprice`, `mall_name`, `maker`, `brand`, `category1~4`를 반환한다.

실패:

- 네이버 credential 누락은 `MISSING_NAVER_CREDENTIALS`로 반환한다.
- API 실패는 `NAVER_API_REQUEST_FAILED`로 반환한다.

### fetch_gsc_product_metadata

입력:

```json
{
  "product_url": "https://smartstore.naver.com/gsc_korea_dt_bh/products/..."
}
```

동작:

- whitelist URL만 허용한다.
- HTML에서 가능한 범위로 `title`, `description`, `image`, `price`, `availability` metadata를 읽는다.
- redirect 후 whitelist를 벗어나면 실패로 처리한다.

metadata fetch는 best effort다. 실패해도 검색 API 후보만으로 `CANDIDATES_ONLY` 또는 `NO_MATCH`를 판단할 수 있어야 한다.

## 6. DB 저장 정책

테이블: `mcp_product_enrichments`

주요 필드:

- `post_id`: 후기 게시글 ID
- `status`: `REQUESTED`, `PROCESSING`, `COMPLETED`, `FAILED`
- `match_status`: `VERIFIED`, `CANDIDATES_ONLY`, `NO_MATCH`
- `query_text`: 검색어
- `confidence_score`: 매칭 점수
- `matched_product_json`: 확정 상품 JSON
- `candidates_json`: 공식 URL 후보 JSON 목록
- `match_reasons_json`: 매칭 또는 실패 근거
- `source_url`: 확정 상품 또는 대표 후보 URL
- `error_message`: 실패 메시지
- `fetched_at`: 외부 MCP/API fetch 시각

같은 후기 글에 여러 enrichment가 있을 수 있지만, 화면에서는 최신 enrichment를 우선 사용한다. 캐시 TTL 안의 `COMPLETED` 결과가 있으면 새 외부 호출을 만들지 않는다.

## 7. 매칭 규칙

공식 스마트스토어 URL이 아니면 즉시 제외한다.

자동 확정 조건:

```text
score >= 0.82
identity evidence count >= 2
1위와 2위 score 차이 >= 0.10
```

점수 근거:

- 공식 URL 통과: `0.20`
- 피규어명 핵심 토큰 일치: 최대 `0.34`
- 전체 피규어명 phrase 포함: 추가 `0.08`
- 상품 라인 일치: `0.22`
- 상품 라인 불일치: `-0.18`
- 작품/시리즈 태그 일치: `0.16`
- 제조사/브랜드 보조 일치: `0.10`
- 가격대 보조 일치: `0.05`

캐릭터명만 일치하는 후보는 자동 확정하지 않는다. 피규어명 일부 일치가 있어도 상품 라인, 작품명, 제조사 같은 다른 identity evidence가 부족하면 `CANDIDATES_ONLY`로 저장한다.

## 8. API

### GET /api/v1/posts/{post_id}/product-enrichment

후기 상세에서 최신 공식 상품 정보 보강 결과를 조회한다.

- REVIEW 게시글만 허용한다.
- 저장된 결과가 없으면 `null`을 반환한다.
- 비후기 게시글은 `400 Bad Request`를 반환한다.

### POST /api/v1/posts/{post_id}/product-enrichment

로그인 사용자가 공식 상품 정보 조회를 요청한다.

- REVIEW 게시글만 허용한다.
- 피규어 정보가 없는 REVIEW 게시글은 실패한다.
- TTL 안의 완료 결과가 있으면 캐시를 반환한다.
- 캐시가 없으면 `REQUESTED` row를 만들고 background task를 등록한다.
- 응답 status code는 `202 Accepted`다.

## 9. 프론트 화면 정책

`ProductInfoCard`는 REVIEW 게시글에서만 렌더링한다.

- `VERIFIED`: 공식 판매 정보 카드 표시
- `CANDIDATES_ONLY`: “정확한 공식 상품을 확정할 수 없음”과 후보 표시
- `NO_MATCH`: 간단한 빈 상태 안내
- `FAILED`: 외부 정보 조회 실패 안내
- `REQUESTED`/`PROCESSING`: polling으로 최신 상태 재조회

후보 목록은 공식 확정 상품처럼 보이지 않도록 VERIFIED 카드와 다른 UI로 표시한다.

## 10. 실패 처리

네이버 API key 누락:

- MCP tool은 `MISSING_NAVER_CREDENTIALS`를 반환한다.
- 백엔드는 `FAILED` 상태로 저장한다.
- 화면은 실패 안내를 보여주되 후기 상세 페이지 전체는 깨지지 않는다.

MCP 서버 장애:

- backend MCP client가 `MCP_REQUEST_FAILED`, `MCP_HTTP_ERROR`, `MCP_REQUEST_TIMEOUT` 등을 반환한다.
- 백엔드는 `FAILED` 상태와 오류 근거를 저장한다.

후보 없음:

- 외부 시스템 오류가 아니므로 `COMPLETED + NO_MATCH`로 저장한다.

공식 후보는 있지만 확정 불가:

- `COMPLETED + CANDIDATES_ONLY`로 저장한다.

## 11. 테스트 계획

- 정확한 상품명은 `VERIFIED`가 된다.
- 공식 스토어가 아닌 상품은 제외된다.
- 캐릭터명만 같은 다른 피규어는 자동 확정되지 않는다.
- `NENDOROID` 후기에서 scale/figma 후보는 감점 또는 제외된다.
- 네이버 API key 누락 시 `FAILED`가 저장된다.
- MCP 서버 장애 시 후기 상세 페이지는 깨지지 않는다.
- 캐시 TTL 안에서는 반복 요청해도 외부 MCP를 다시 호출하지 않는다.

상세 테스트 절차는 `docs/testing/test-scenarios.md`의 `MCP-*` 시나리오를 따른다.

## 12. 한계와 개선 방향

- 현재 매칭은 규칙 기반이다. 실제 오탐 케이스가 쌓이면 alias 사전과 점수를 조정해야 한다.
- 현재 프론트는 polling으로 상태를 확인한다. 추후 SSE나 WebSocket으로 바꿀 수 있다.
- 현재 공식 스토어는 `gsc_korea_dt_bh` 하나만 허용한다. 다른 공식 채널이 생기면 whitelist 정책을 확장해야 한다.
- 네이버 검색 API의 상품명/브랜드 metadata 품질에 따라 후보 누락이 생길 수 있다.
