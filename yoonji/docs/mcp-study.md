# MCP Study

이 문서는 MCP 구현을 진행하면서 MCP 개념과 코드 구조를 학습하기 위해 정리한다.

## MCP Phase 1. MCP 서버 뼈대 구현

### 1. 이번 Phase에서 구현한 기능 요약

이번 Phase에서는 `mcp-server` 디렉터리에 독립 실행 가능한 Python MCP 서버 뼈대를 만들었다.

서버는 Streamable HTTP transport를 사용하며 로컬 기본 주소는 `http://127.0.0.1:8765/mcp`이다. 등록한 tool은 두 개다.

- `search_gsc_smartstore_products`: 네이버 쇼핑 검색 API를 호출하고, 결과 중 굿스마일 컴퍼니 코리아 공식 스마트스토어 URL만 남긴다.
- `fetch_gsc_product_metadata`: whitelist를 통과한 공식 스마트스토어 상품 URL에서 가능한 범위의 메타데이터를 읽는다.

이번 Phase는 "외부 데이터 수집 도구"까지만 만든다. 상품 후보를 실제 후기 게시글과 매칭해서 검증하거나 DB에 저장하는 일은 이후 MCP Phase 2~4에서 백엔드 service와 repository가 담당한다.

### 2. 수정하거나 추가한 파일

`mcp-server/requirements.txt`
- MCP 서버 실행에 필요한 패키지를 적었다.
- `mcp[cli]>=1.27,<2`로 Python MCP SDK v1 계열을 사용한다. v2가 아직 alpha이므로 학습 프로젝트에서는 안정적인 v1 범위를 고정했다.
- `httpx`, `pydantic`, `python-dotenv`를 MCP 서버의 HTTP 호출, 입력/응답 schema, 환경변수 로딩 기반으로 둔다.

`mcp-server/main.py`
- 서버 실행 진입점이다.
- `python main.py`로 실행하면 `server.py`의 `run_server()`가 호출된다.

`mcp-server/server.py`
- `FastMCP` 서버를 만들고 Phase 1의 두 tool을 등록한다.
- host는 `MCP_HOST` 기본값 `127.0.0.1`, port는 `MCP_PORT` 기본값 `8765`를 사용한다.
- `streamable_http_path="/mcp"`, `json_response=True`, `stateless_http=True`로 설정했다.

`mcp-server/clients/http_client.py`
- 외부 HTTP 호출 공통 wrapper다.
- timeout, redirect, HTTP 오류, JSON 파싱 오류를 한 곳에서 구조화된 예외로 바꾼다.
- stdout 로그를 남기지 않는다.

`mcp-server/clients/naver_shopping_client.py`
- 네이버 쇼핑 검색 API만 담당하는 client다.
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`이 없으면 `MISSING_NAVER_CREDENTIALS` 오류를 낸다.
- 공식 스마트스토어 필터링은 이 파일에서 하지 않는다. API 호출 계층과 검증 계층을 분리하기 위해서다.

`mcp-server/schemas/tool_schema.py`
- tool 입력과 출력 모델을 정의한다.
- 검색 입력은 `query`, `display`, `sort`를 검증한다.
- 응답은 성공 여부, 후보 목록, 구조화된 오류를 같은 모양으로 반환한다.

`mcp-server/tools/shopping_metadata_tool.py`
- MCP tool의 실제 동작을 구현한다.
- 네이버 검색 결과에서 `https://smartstore.naver.com/gsc_korea_dt_bh/...` URL만 남긴다.
- 상품명 HTML 태그를 제거하고 공백을 정리한다.
- whitelist된 상품 URL에서 `og:title`, `og:description`, `og:image`, 가격, 판매 상태 같은 메타데이터를 best effort로 읽는다.

### 3. MCP server, tool, client, backend service, API route의 역할

MCP server는 외부 기능을 LLM 또는 백엔드가 표준 프로토콜로 호출할 수 있게 노출하는 서버다. 이번 코드에서는 `FastMCP`가 서버 역할을 한다.

MCP tool은 서버가 제공하는 개별 기능이다. 이번 Phase에서는 네이버 쇼핑 검색과 상품 메타데이터 조회를 tool로 만들었다.

Client는 외부 API 호출을 담당한다. `NaverShoppingClient`는 네이버 API 인증 헤더와 요청 파라미터만 다룬다.

Backend service는 아직 구현하지 않았다. 이후 Phase에서 MCP tool 결과를 다시 검증하고, 매칭 점수를 계산하고, DB 저장 여부를 결정한다.

API route도 아직 구현하지 않았다. 이후 Phase에서 `GET /api/v1/posts/{post_id}/product-enrichment`, `POST /api/v1/posts/{post_id}/product-enrichment`를 통해 프론트와 연결한다.

### 4. 네이버 쇼핑 API와 외부 metadata 수집 방식

네이버 쇼핑 검색은 `https://openapi.naver.com/v1/search/shop.json`에 GET 요청을 보낸다.

요청에는 다음 값이 들어간다.

```text
query: 검색어
display: 한 번에 받을 결과 수
start: 1
sort: sim | date | asc | dsc
```

인증 정보는 HTTP header에 담는다.

```text
X-Naver-Client-Id: NAVER_CLIENT_ID
X-Naver-Client-Secret: NAVER_CLIENT_SECRET
```

네이버 응답의 `title`에는 `<b>` 태그가 들어갈 수 있으므로 tool에서 HTML 태그를 제거한다. `link`, `image`, `lprice`, `hprice`, `mallName`, `productId`, `maker`, `brand`, `category1~4`는 상품 후보 metadata로 내려준다.

상품 상세 metadata는 whitelist URL만 대상으로 HTML을 가져와서 `<title>`과 Open Graph meta tag를 읽는다. 이 단계는 실패해도 전체 기능이 멈추면 안 된다. 이후 백엔드는 검색 API 후보만으로도 `CANDIDATES_ONLY` 또는 `NO_MATCH`를 판단할 수 있어야 한다.

### 5. 공식 스마트스토어 whitelist 검증

이번 Phase의 가장 중요한 안전장치는 URL whitelist다.

허용 조건은 다음과 같다.

```text
scheme: https
host: smartstore.naver.com
path: /gsc_korea_dt_bh 또는 /gsc_korea_dt_bh/...
```

상품명이 아무리 비슷해도 이 조건을 통과하지 못하면 후보에서 제외한다. MCP tool이 외부 API 결과를 그대로 믿지 않고 1차 필터링을 하는 이유는, 잘못된 판매처를 공식 판매 정보처럼 보여주는 일을 막기 위해서다.

### 6. 상품명 불일치와 잘못된 매칭 방지 규칙

Phase 1에서는 자동 확정 매칭을 하지 않는다.

이번 tool이 하는 일은 다음 두 가지뿐이다.

- 공식 스마트스토어 URL인지 확인한다.
- 상품명에서 HTML 태그를 제거하고 공백을 정리한다.

후기 게시글의 피규어명, 제조사, 라인, 작품명, 가격대를 후보와 비교해 점수를 계산하는 일은 MCP Phase 3의 backend matching service가 담당한다.

이렇게 나누는 이유는 MCP 서버가 "외부 데이터를 가져오는 곳"이고, 백엔드 service가 "우리 서비스 정책으로 검증하는 곳"이기 때문이다.

### 7. 실패와 fallback 처리

모든 tool은 실패 시 예외를 그대로 터뜨리지 않고 구조화된 오류를 반환한다.

예시:

```json
{
  "ok": false,
  "error": {
    "code": "MISSING_NAVER_CREDENTIALS",
    "message": "NAVER_CLIENT_ID and NAVER_CLIENT_SECRET must be set before calling the Naver Shopping Search API.",
    "details": {}
  }
}
```

주요 오류는 다음과 같다.

- `INVALID_TOOL_INPUT`: tool 입력값이 비어 있거나 허용 범위를 벗어남
- `MISSING_NAVER_CREDENTIALS`: 네이버 API key 누락
- `NAVER_API_REQUEST_FAILED`: 네이버 API 호출 실패
- `WHITELIST_MISMATCH`: 공식 스마트스토어 URL이 아님
- `METADATA_FETCH_FAILED`: 상품 상세 HTML fetch 실패
- `WHITELIST_MISMATCH_AFTER_REDIRECT`: 요청 URL은 whitelist였지만 redirect 후 다른 곳으로 이동

### 8. 직접 테스트하는 방법

패키지 설치:

```bash
cd mcp-server
pip install -r requirements.txt
```

환경변수:

```powershell
$env:NAVER_CLIENT_ID = "발급받은_클라이언트_ID"
$env:NAVER_CLIENT_SECRET = "발급받은_클라이언트_SECRET"
$env:GSC_SMARTSTORE_CHANNEL = "gsc_korea_dt_bh"
$env:MCP_HOST = "127.0.0.1"
$env:MCP_PORT = "8765"
```

서버 실행:

```bash
python main.py
```

MCP Inspector 또는 MCP client에서 다음 주소로 연결한다.

```text
http://127.0.0.1:8765/mcp
```

검색 tool 입력 예시:

```json
{
  "query": "넨도로이드 하츠네 미쿠",
  "display": 10,
  "sort": "sim"
}
```

검색 tool 응답 예시:

```json
{
  "ok": true,
  "query": "넨도로이드 하츠네 미쿠",
  "total": 123,
  "display": 10,
  "returned_count": 1,
  "discarded_count": 9,
  "candidates": [
    {
      "title": "넨도로이드 하츠네 미쿠 ...",
      "normalized_title": "넨도로이드 하츠네 미쿠 ...",
      "link": "https://smartstore.naver.com/gsc_korea_dt_bh/products/...",
      "image": "https://...",
      "lprice": 65000,
      "hprice": null,
      "mall_name": "굿스마일컴퍼니",
      "maker": "GOOD SMILE COMPANY",
      "brand": "GOOD SMILE COMPANY",
      "is_official_store_url": true
    }
  ],
  "error": null
}
```

metadata tool 입력 예시:

```json
{
  "product_url": "https://smartstore.naver.com/gsc_korea_dt_bh/products/1234567890"
}
```

metadata tool 응답 예시:

```json
{
  "ok": true,
  "metadata": {
    "product_url": "https://smartstore.naver.com/gsc_korea_dt_bh/products/1234567890",
    "final_url": "https://smartstore.naver.com/gsc_korea_dt_bh/products/1234567890",
    "title": "상품명",
    "description": "상품 설명",
    "image": "https://...",
    "price": 65000,
    "availability": "in stock"
  },
  "error": null
}
```

### 9. 이번 구현의 한계와 다음 개선 방향

이번 Phase는 MCP 서버와 외부 조회 tool까지만 구현했다. 아직 백엔드 DB 모델, 캐시 TTL, 매칭 점수, API route, 프론트 상세 카드는 없다.

검색 결과의 공식 URL 필터링은 강하게 적용하지만, 공식 URL 후보가 실제 후기의 피규어와 같은 상품인지는 판단하지 않는다. 다음 Phase에서는 `McpProductEnrichment` 저장 모델을 만들고, 그 다음 Phase에서 피규어명, 상품 라인, 제조사, 가격대 기반 matching score를 구현해야 한다.

metadata fetch는 meta tag 중심의 best effort 방식이다. 스마트스토어 HTML 구조가 바뀌거나 메타 태그가 부족하면 일부 필드가 비어 있을 수 있다. 그래서 백엔드는 metadata fetch 실패를 치명 오류로 취급하지 않고 검색 API 후보만으로도 fallback을 처리해야 한다.

### 10. 참고 문서

- MCP Python SDK README: https://github.com/modelcontextprotocol/python-sdk
- MCP Tools specification: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP Transports specification: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Naver Shopping Search API: https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md
