# Agent Study Notes

이 문서는 `yoonji` 프로젝트에 Post-Context Function-Calling Agent를 붙인다고 가정했을 때,
agent가 무엇이고 기존 RAG/MCP 코드와 어떻게 연결되는지 학습하기 위해 정리한 문서다.

여기서 말하는 agent는 독립적인 자유 채팅 기능이 아니다.
게시글 상세 화면이라는 맥락 안에서 사용자의 요청을 보고, 필요한 도구를 고른 뒤, 도구 실행 결과를 확인하고,
최종 답변을 만드는 얇은 오케스트레이터다.

핵심 흐름은 다음과 같다.

```text
사용자 요청
-> 게시글 맥락 확인
-> LLM이 사용할 수 있는 tool 목록 전달
-> LLM이 tool call 선택
-> 서버가 tool 실행
-> tool 결과를 다시 LLM에 전달
-> 필요하면 추가 tool call 반복
-> 최종 답변 생성
-> AiOutput에 저장
```

OpenAI function calling 문서에서도 tool calling을 모델 요청, tool call 수신, 애플리케이션 쪽 실행,
tool 결과 재전달, 최종 응답 수신의 다단계 흐름으로 설명한다.

- Function calling: <https://platform.openai.com/docs/guides/function-calling>
- Responses API tools: <https://platform.openai.com/docs/api-reference/responses>

## 1. Agent를 왜 붙이는가

현재 프로젝트에는 이미 RAG 기능과 MCP 상품 정보 조회 기능이 나뉘어 있다.

- 질문 게시글: 과거 질문/댓글 chunk를 검색해서 AI 참고 답변 생성
- 구매 고민 게시글: 후기 게시글 chunk를 검색해서 구매 요약 생성
- 후기 게시글: 유사 후기 추천
- MCP 상품 정보: 굿스마일 공식 스마트스토어 후보 검색과 매칭

이 기능들은 각각 잘 동작하지만, 사용자의 요청이 조금 복합적이면 서버가 미리 정한 한 가지 흐름만으로는 부족해진다.

예를 들어 후기 게시글 상세에서 사용자가 이렇게 물을 수 있다.

```text
이 피규어랑 비슷한 후기 좀 보고, 공식 상품 후보도 있으면 같이 알려줘.
```

이 요청에는 두 가지 일이 섞여 있다.

1. 현재 후기와 비슷한 후기 검색
2. MCP를 통한 공식 상품 후보 검색

기존 방식에서는 각각 별도 버튼이나 별도 API로 나눠 호출해야 한다.
agent 방식에서는 LLM이 사용자의 요청과 게시글 종류를 보고 어떤 도구를 쓸지 고른다.

```text
요청 이해
-> REVIEW 게시글임을 확인
-> rag_similar_review_posts tool 호출
-> 필요하면 mcp_gsc_product_search tool 호출
-> 두 결과를 종합해서 최종 답변 작성
```

즉 agent의 역할은 "답변을 바로 생성하는 것"이 아니라 "어떤 근거 수집 도구를 어떤 순서로 쓸지 판단하는 것"이다.

## 2. RAG와 Agent의 차이

RAG와 agent는 서로 대체 관계가 아니다.
agent는 RAG를 도구로 사용할 수 있다.

### 일반 LLM 답변

일반 LLM 답변은 서버가 모델에 바로 질문을 넣고 답을 받는 방식이다.

```text
사용자 질문
-> LLM
-> 답변
```

이 방식은 구현은 단순하지만, 프로젝트 DB에 있는 게시글/댓글 근거를 직접 보지 못한다.
따라서 커뮤니티 안에 쌓인 실제 후기, 질문, 댓글을 기준으로 답변해야 하는 기능에는 맞지 않는다.

### RAG chain

RAG는 먼저 검색하고, 검색된 근거를 LLM에 넣어 답변한다.

```text
사용자 요청 또는 게시글 맥락
-> Retriever
-> 관련 chunk 검색
-> Prompt에 context 삽입
-> LLM
-> 근거 기반 답변
```

현재 프로젝트의 질문 참고 답변과 구매 고민 요약은 이 구조에 가깝다.
서버 코드가 "이 API는 질문 RAG를 실행한다", "이 API는 구매 요약 RAG를 실행한다"처럼 흐름을 미리 정해 둔다.

### Function-calling agent

agent는 RAG를 무조건 한 번 실행하는 것이 아니라, 모델에게 사용할 수 있는 도구 목록을 알려주고 어떤 도구가 필요한지 고르게 한다.

```text
사용자 요청 + 게시글 맥락 + tool 목록
-> LLM이 tool call 선택
-> 서버가 tool 실행
-> tool 결과를 LLM에 전달
-> LLM이 다음 tool call 또는 최종 답변 선택
```

이 차이가 중요하다.
RAG chain에서는 서버가 검색 전략을 고정한다.
agent에서는 LLM이 상황에 맞게 도구를 선택한다.

다만 이 프로젝트에서는 agent의 자유도를 제한해야 한다.
AGENTS.md의 정책상 독립 자유질문형 `POST /api/v1/ai/qna`를 만들지 않기 때문이다.
따라서 agent도 반드시 게시글 상세 맥락 안에서만 동작해야 한다.

## 3. Function Calling 흐름

Function calling은 모델이 서버 코드를 직접 실행하는 기능이 아니다.
모델은 "이 함수를 이런 인자로 호출하고 싶다"는 구조화된 요청만 만든다.
실제 함수 실행은 FastAPI 서버가 한다.

기본 흐름은 다음과 같다.

```text
1. 서버가 모델에 메시지와 tool schema를 보낸다.
2. 모델이 tool call을 반환한다.
3. 서버가 tool 이름과 arguments를 검증한다.
4. 서버가 실제 Python 함수를 실행한다.
5. 서버가 tool output을 다시 모델에 보낸다.
6. 모델이 최종 답변을 반환하거나 추가 tool call을 요청한다.
```

agent loop는 이 과정을 반복하는 코드다.
이번 설계에서는 최대 4회까지만 반복하도록 제한한다.
무한 반복이나 과도한 API 비용을 막기 위해서다.

의사 코드는 다음과 같다.

```python
def run_agent(post, user_message):
    messages = build_initial_messages(post, user_message)
    trace = []

    for step in range(4):
        response = agent_client.create_response(
            messages=messages,
            tools=allowed_tools_for(post.board.code),
        )

        if response.has_no_tool_call():
            return final_answer(response, trace)

        for tool_call in response.tool_calls:
            tool_result = execute_tool_call(tool_call, post)
            trace.append(tool_result)
            messages.append_tool_result(tool_call, tool_result)

    return fallback_answer(trace)
```

여기서 중요한 책임 분리는 다음과 같다.

- LLM: 어떤 tool을 쓸지 판단한다.
- FastAPI 서버: tool 호출 권한과 인자를 검증한다.
- Python tool 함수: 기존 RAG/MCP service를 호출한다.
- AiOutput: 최종 답변, 상태, trace, 근거를 저장한다.

## 4. 현재 프로젝트 코드 지도

agent를 추가하기 전에 현재 코드가 어떤 역할을 하는지 알아야 한다.
agent는 완전히 새로운 기능을 만드는 것이 아니라 기존 기능을 tool로 감싸는 계층이기 때문이다.

### `backend/app/services/ai_service.py`

현재 AI 답변형 기능의 진입점이다.

주요 역할은 다음과 같다.

- 게시글이 존재하는지 확인한다.
- 게시판 종류가 기능에 맞는지 확인한다.
- `AiOutput(status=REQUESTED)`를 먼저 만든다.
- FastAPI `BackgroundTasks`에 실제 생성 작업을 등록한다.
- background task에서 `PROCESSING`, `GENERATED`, `FAILED` 상태를 갱신한다.
- 생성된 답변과 sources를 저장한다.

agent를 추가할 때도 이 파일의 패턴을 따른다.
즉 route가 직접 OpenAI를 호출하지 않고, service가 `AiOutput` 생성과 background task 등록을 담당한다.

추가될 함수의 형태는 다음과 비슷하다.

```python
def request_agent_answer(
    db: Session,
    *,
    post_id: int,
    payload: AgentAnswerRequest,
    current_user: User,
    background_tasks: BackgroundTasks,
) -> AiOutputResponse:
    ...
```

### `backend/app/ai/rag/retriever.py`

agent가 사용할 RAG 검색 도구의 실제 기반이다.

현재 중요한 함수는 다음과 같다.

- `retrieve_similar_review_posts()`
  - REVIEW 게시글의 유사 후기 추천에 사용된다.
- `retrieve_question_reference_chunks()`
  - QUESTION 게시글의 과거 질문/댓글 근거 검색에 사용된다.
- `retrieve_purchase_summary_chunks()`
  - PURCHASE_HELP 게시글에서 REVIEW 후기 근거 검색에 사용된다.

agent tool은 이 함수들을 직접 또는 usecase를 통해 호출한다.
중요한 점은 agent가 vector search 자체를 새로 구현하지 않는다는 것이다.
검색 로직은 이미 `retriever.py`에 있으므로 agent는 "검색 도구를 언제 호출할지"만 결정한다.

### `backend/app/ai/rag/rag_chain.py`

검색된 chunk를 LLM 답변으로 바꾸는 생성 단계다.

현재 함수는 다음과 같다.

- `generate_question_reference_answer()`
- `generate_purchase_summary()`

이 파일은 RAG chain용 prompt 구성과 LLM 호출을 담당한다.
agent를 추가하면 `rag_chain.py`를 직접 재사용할 수도 있고,
agent 전용 최종 답변 생성은 `backend/app/ai/agent/agent_client.py`와 `prompts.py`에서 처리할 수도 있다.

권장 방향은 다음과 같다.

- 기존 RAG API는 계속 `rag_chain.py`를 사용한다.
- agent API는 tool 결과를 모아 agent 전용 prompt로 최종 답변을 생성한다.
- 이렇게 해야 기존 RAG 기능과 agent 기능이 서로 섞이지 않는다.

### `backend/app/ai/usecases/*`

기능별 비즈니스 흐름이 들어 있는 계층이다.

- `similar_posts.py`
  - 유사 후기 추천 결과를 response schema로 만든다.
- `question_reference_answer.py`
  - 질문 RAG 결과를 `AiOutput`과 `AiOutputSource`에 저장한다.
- `purchase_summary.py`
  - 구매 요약 RAG 결과를 `AiOutput`과 `AiOutputSource`에 저장한다.

agent tool은 usecase를 재사용할 때와 retriever를 직접 사용할 때를 구분해야 한다.

저장까지 포함된 기존 usecase를 그대로 호출하면 agent 내부에서 중간 `AiOutput`이 또 생기는 문제가 생길 수 있다.
따라서 agent tool에서는 보통 retriever 중심의 "근거 조회"만 수행하고,
최종 저장은 agent 자신의 `AiOutput` 하나에 모으는 편이 깔끔하다.

### `backend/app/mcp/client.py`

MCP 서버와 통신하는 작은 JSON-RPC client다.

현재 제공하는 호출은 다음과 같다.

- `search_gsc_smartstore_products()`
- `fetch_gsc_product_metadata()`

agent가 MCP를 사용할 때도 외부 HTTP 호출을 직접 구현하지 않는다.
이 client를 tool 뒤에서 호출한다.

### `backend/app/services/product_enrichment_service.py`

MCP 상품 후보를 검색하고, 현재 후기 게시글의 피규어 정보와 매칭하는 service다.

현재는 REVIEW 게시글의 상품 보강 기능에 가깝다.
agent v1에서는 운영 데이터로 확정 저장하지 않고, MCP 호출 결과를 `AiOutput.metadata_json`의 trace에 남기는 정도로 시작한다.

이렇게 시작하면 agent 기능을 실험하면서도 기존 상품 보강 저장 흐름을 망가뜨리지 않는다.

## 5. Agent 계층을 추가한다면 들어갈 파일

agent 구현은 새 패키지로 분리하는 것이 좋다.

```text
backend/app/ai/agent/
  __init__.py
  agent_runner.py
  agent_client.py
  tools.py
  tool_schemas.py
  prompts.py
```

### `agent_runner.py`

agent loop의 중심이다.

역할은 다음과 같다.

- 게시글 맥락과 사용자 요청으로 초기 메시지를 만든다.
- 게시판별 허용 tool 목록을 고른다.
- OpenAI Responses API를 호출한다.
- tool call이 오면 `tools.py`에 실행을 위임한다.
- tool output을 다시 모델 입력에 넣는다.
- 최종 답변과 trace를 반환한다.
- 최대 반복 횟수를 관리한다.

이 파일은 agent의 "두뇌"라기보다 "반복 제어기"에 가깝다.
판단은 모델이 하지만, 어떤 도구를 허용하고 몇 번까지 반복할지는 서버가 통제한다.

### `agent_client.py`

OpenAI API 호출을 감싸는 wrapper다.

역할은 다음과 같다.

- `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL` 설정을 사용한다.
- Responses API 호출을 한 곳에 모은다.
- tool call 응답과 최종 text 응답을 프로젝트에서 쓰기 쉬운 dataclass로 바꾼다.
- OpenAI 오류를 agent service가 처리하기 쉬운 예외로 변환한다.

route나 service가 OpenAI SDK의 응답 구조를 직접 알게 되면 유지보수가 어려워진다.
따라서 LLM client는 얇더라도 반드시 분리하는 것이 좋다.

### `tools.py`

agent가 호출할 수 있는 실제 Python tool registry다.

역할은 다음과 같다.

- tool 이름을 Python 함수에 매핑한다.
- 게시판별 allowlist를 검사한다.
- arguments를 검증한다.
- 기존 retriever, usecase, MCP client를 호출한다.
- tool 실행 결과를 JSON 직렬화 가능한 dict로 반환한다.
- source로 저장할 RAG chunk 정보를 함께 모은다.

tool 함수는 복잡한 비즈니스 로직을 새로 만들지 않는다.
이미 있는 service/retriever를 감싸는 얇은 adapter여야 한다.

### `tool_schemas.py`

OpenAI에 전달할 tool JSON schema를 정의한다.

예시는 다음과 같다.

```python
RAG_QUESTION_CONTEXT_TOOL = {
    "type": "function",
    "name": "rag_question_context",
    "description": "Find related QUESTION posts and comments for the current question post.",
    "parameters": {
        "type": "object",
        "properties": {
            "post_id": {"type": "integer"},
            "top_k": {"type": "integer", "minimum": 1, "maximum": 20},
        },
        "required": ["post_id"],
        "additionalProperties": False,
    },
}
```

schema를 분리하는 이유는 모델에게 노출되는 tool 계약을 코드에서 명확히 보기 위해서다.
함수 이름, 인자 이름, 설명이 조금만 흔들려도 모델의 tool 선택 품질이 달라질 수 있다.

### `prompts.py`

agent system prompt와 게시판별 지침을 관리한다.

prompt에는 다음 정책이 들어가야 한다.

- 게시글과 tool 결과에 근거해서만 답한다.
- 모르는 내용은 모른다고 말한다.
- RAG source가 부족하면 근거 부족 fallback을 사용한다.
- 사용자가 URL을 직접 입력하게 유도하지 않는다.
- AI 답변을 댓글인 것처럼 표현하지 않는다.
- 구매 결정을 강요하지 않고 참고 정보로 제공한다.

게시판별로 강조점도 달라진다.

- REVIEW: 유사 후기와 상품 후보를 구분한다.
- QUESTION: 과거 질문/댓글 근거를 우선한다.
- PURCHASE_HELP: 후기 근거와 가격대/만족도 정보를 함께 본다.

## 6. Tool 설계

agent v1에서 사용할 tool은 네 개로 시작한다.

| Tool name | 허용 게시판 | 내부 연결 | 역할 |
| --- | --- | --- | --- |
| `rag_question_context` | `QUESTION` | `retrieve_question_reference_chunks()` | 과거 질문/댓글 근거 검색 |
| `rag_purchase_review_context` | `PURCHASE_HELP` | `retrieve_purchase_summary_chunks()` | 구매 고민에 필요한 후기 근거 검색 |
| `rag_similar_review_posts` | `REVIEW` | `similar_posts.get_similar_review_posts()` | 현재 후기와 유사한 후기 추천 |
| `mcp_gsc_product_search` | `REVIEW`, `PURCHASE_HELP` | `ProductMetadataMcpClient.search_gsc_smartstore_products()` | 공식 스마트스토어 상품 후보 조회 |

### 게시판별 allowlist

agent는 모든 tool을 항상 쓸 수 있으면 안 된다.
게시판 맥락에 맞지 않는 tool 호출은 서버에서 막아야 한다.

| 게시판 | 허용 tool |
| --- | --- |
| `REVIEW` | `rag_similar_review_posts`, `mcp_gsc_product_search` |
| `QUESTION` | `rag_question_context` |
| `PURCHASE_HELP` | `rag_purchase_review_context`, `mcp_gsc_product_search` |

이 allowlist는 prompt에 적는 것만으로 부족하다.
LLM이 실수로 다른 tool을 호출할 수 있기 때문에 `tools.py`에서 서버 코드로 다시 검사해야 한다.

### `rag_question_context`

질문 게시글 전용 tool이다.

입력:

```json
{
  "post_id": 10,
  "top_k": 5
}
```

출력 예시:

```json
{
  "ok": true,
  "tool_name": "rag_question_context",
  "chunks": [
    {
      "chunk_id": 101,
      "post_id": 3,
      "comment_id": 7,
      "score": 0.82,
      "excerpt": "비슷한 질문에 대한 댓글 답변 요약..."
    }
  ]
}
```

이 tool은 최종 답변을 만들지 않는다.
질문과 관련된 근거 chunk만 반환한다.
최종 답변은 agent가 tool 결과를 받은 뒤 따로 생성한다.

### `rag_purchase_review_context`

구매 고민 게시글 전용 tool이다.

입력:

```json
{
  "post_id": 20,
  "top_k": 5,
  "include_similar_price_range": true
}
```

출력에는 REVIEW 게시글의 후기 근거, 만족도, 가격대, 매칭 신호가 들어간다.

이 tool은 구매 고민 글 자체를 검색하는 것이 아니라, 구매 판단에 도움이 될 REVIEW 근거를 찾는다.
구매 고민에 대한 답변은 사용자에게 단정적으로 "사라/사지 마라"라고 말하는 것이 아니라, 근거 기반 참고 정보로 제공해야 한다.

### `rag_similar_review_posts`

후기 게시글 전용 tool이다.

입력:

```json
{
  "post_id": 30,
  "limit": 3
}
```

출력은 현재 후기와 유사한 후기 목록이다.
현재 게시글은 결과에서 제외해야 한다.

이 tool은 RAG 중 Retrieval만 사용하는 기능에 가깝다.
LLM이 긴 답변을 생성하지 않아도, 유사 게시글 목록과 추천 이유만으로 사용자에게 도움이 된다.

### `mcp_gsc_product_search`

MCP 상품 후보 검색 tool이다.

입력:

```json
{
  "query": "하츠네 미쿠 넨도로이드 good smile",
  "display": 5
}
```

출력은 굿스마일 공식 스마트스토어 후보 목록이다.

주의할 점은 이 tool의 결과를 곧바로 "정답 상품"으로 취급하면 안 된다는 것이다.
MCP는 외부 후보를 가져오고, backend matching 또는 agent 답변에서 "후보"로 설명해야 한다.

또한 이 프로젝트 정책상 사용자가 게시글 작성 시 URL을 직접 입력하지 않는다.
따라서 agent도 사용자에게 "URL을 넣어 달라"고 요구하거나, 사용자가 직접 호출하는 링크 미리보기 API를 만들면 안 된다.

## 7. 게시판별 Agent 동작 예시

### QUESTION 게시글

사용자 요청:

```text
이 질문에 답변 참고할 만한 과거 사례가 있어?
```

흐름:

```text
QUESTION 게시글 확인
-> 허용 tool: rag_question_context
-> 과거 QUESTION 게시글/댓글 chunk 검색
-> 근거가 있으면 답변 작성
-> AiOutputSource에 사용한 chunk 저장
-> 근거가 없으면 fallback 답변
```

이 경우 MCP tool은 허용하지 않는다.
질문 게시판의 참고 답변은 커뮤니티 안의 과거 질문/댓글 근거가 핵심이기 때문이다.

### PURCHASE_HELP 게시글

사용자 요청:

```text
이거 살지 고민 중인데 후기 기준으로 장단점 정리해줘.
```

흐름:

```text
PURCHASE_HELP 게시글 확인
-> 허용 tool: rag_purchase_review_context, mcp_gsc_product_search
-> 우선 REVIEW chunk 검색
-> 필요하면 상품 후보 검색
-> 후기 근거 중심으로 장점/주의점/추천 기준 정리
-> RAG source 저장
-> MCP 결과는 metadata_json.mcp_sources에 저장
```

구매 고민 답변은 후기 근거가 없으면 무리하게 지어내면 안 된다.
MCP 상품 후보가 있어도 커뮤니티 후기 근거가 부족하면 그 한계를 밝혀야 한다.

### REVIEW 게시글

사용자 요청:

```text
비슷한 후기랑 공식 상품 후보를 같이 알려줘.
```

흐름:

```text
REVIEW 게시글 확인
-> 허용 tool: rag_similar_review_posts, mcp_gsc_product_search
-> 유사 후기 검색
-> 필요하면 MCP 상품 후보 검색
-> 유사 후기와 상품 후보를 구분해서 답변
-> 추천 결과는 AiOutputSource보다 metadata trace 중심으로 기록
```

유사 후기 추천 결과는 기존 설계처럼 실시간 계산이 자연스럽다.
agent 답변 안에 포함할 수는 있지만, 추천 결과 자체를 별도 영구 추천 테이블로 저장하지 않는다.

## 8. AiOutput 저장 흐름

agent 답변도 기존 AI 답변과 동일하게 댓글로 저장하지 않는다.
사용자 작성 콘텐츠와 AI 생성 콘텐츠를 DB에서도 분리해야 하기 때문이다.

추가할 enum은 다음과 같다.

```python
class AiOutputType(str, Enum):
    QUESTION_REFERENCE_ANSWER = "QUESTION_REFERENCE_ANSWER"
    PURCHASE_SUMMARY = "PURCHASE_SUMMARY"
    AGENT_ANSWER = "AGENT_ANSWER"
```

agent 요청 시 저장 흐름은 다음과 같다.

```text
POST /api/v1/posts/{post_id}/ai/agent-answer
-> AiOutput 생성
   status = REQUESTED
   output_type = AGENT_ANSWER
   query_text = 사용자 message + 게시글 맥락 요약
-> background task 시작
-> status = PROCESSING
-> agent loop 실행
-> 최종 답변 저장
   status = GENERATED
   content = 최종 답변
   grounding_status = GROUNDED/PARTIALLY_GROUNDED/NO_EVIDENCE
   metadata_json.agent_trace = tool call 기록
   metadata_json.mcp_sources = MCP 후보 요약
-> RAG 근거가 있으면 AiOutputSource 저장
```

`metadata_json.agent_trace` 예시는 다음과 같다.

```json
{
  "agent_trace": [
    {
      "step": 1,
      "tool_name": "rag_purchase_review_context",
      "arguments": {
        "post_id": 20,
        "top_k": 5
      },
      "ok": true,
      "result_summary": "3 review chunks returned"
    },
    {
      "step": 2,
      "tool_name": "mcp_gsc_product_search",
      "arguments": {
        "query": "하츠네 미쿠 넨도로이드",
        "display": 5
      },
      "ok": true,
      "result_summary": "2 official SmartStore candidates returned"
    }
  ]
}
```

이 trace는 사용자가 보는 본문 답변과 다르다.
개발자가 agent가 어떤 판단과 tool 호출을 했는지 추적하기 위한 기록이다.

RAG source는 기존 `AiOutputSource`를 재사용한다.

```text
AiOutput
-> AiOutputSource
   -> ContentChunk
      -> Post 또는 Comment
```

이 구조를 유지하면 기존 `AiSourceList` UI도 재사용할 수 있다.

## 9. 예외 처리와 fallback

agent는 여러 tool을 호출하기 때문에 실패 지점도 늘어난다.
그래서 실패를 두 종류로 나누는 것이 좋다.

### tool 하나의 실패

예를 들어 MCP 서버가 꺼져 있을 수 있다.
이때 RAG 검색은 성공했다면 agent 전체를 실패 처리할 필요는 없다.

```text
MCP tool failed
-> trace에 실패 기록
-> 가능한 RAG 근거만으로 최종 답변
-> 답변에 "상품 후보 조회는 실패했다"고 설명
```

### 핵심 근거가 모두 없는 경우

질문 답변이나 구매 요약처럼 근거가 중요한 기능에서 RAG source가 하나도 없다면 fallback을 반환해야 한다.

```json
{
  "answer": "관련 게시글이나 댓글 근거가 부족해 답변을 생성할 수 없습니다.",
  "sources": []
}
```

이 fallback은 실패가 아니라 정상적인 방어 동작이다.
RAG 기반 기능에서는 "근거가 없으면 답하지 않는다"가 품질을 지키는 핵심 규칙이다.

### board allowlist 위반

모델이 QUESTION 게시글에서 `mcp_gsc_product_search`를 호출하려고 할 수 있다.
이 경우 서버는 tool 실행을 거부해야 한다.

```json
{
  "ok": false,
  "error_code": "TOOL_NOT_ALLOWED_FOR_BOARD",
  "message": "mcp_gsc_product_search is not allowed for QUESTION posts."
}
```

이 결과를 다시 모델에 전달하면 모델은 허용된 tool만 사용하거나 최종 fallback 답변을 만들 수 있다.

### max iteration 초과

agent loop는 최대 4회로 제한한다.
4회 안에 최종 답변이 나오지 않으면 안전하게 중단한다.

처리 방식은 다음 중 하나로 고정한다.

- RAG 근거가 있으면 부분 근거 답변을 생성하고 `PARTIALLY_GROUNDED`로 저장
- 근거가 없으면 fallback 답변과 `NO_EVIDENCE`로 저장
- 모델/API 오류가 반복되면 `FAILED`로 저장

## 10. 테스트 방법

agent 구현 후에는 실제 OpenAI API 호출 테스트와 별개로 fake client 테스트를 먼저 준비하는 것이 좋다.
function calling agent는 LLM 응답 구조에 따라 분기가 많기 때문이다.

### backend compile

```powershell
cd backend
python -m py_compile app/ai/agent/agent_runner.py app/ai/agent/agent_client.py app/ai/agent/tools.py app/ai/agent/tool_schemas.py app/ai/agent/prompts.py
```

### unit 수준 테스트

확인할 시나리오:

- fake LLM이 `rag_question_context` tool call을 반환하면 tool이 실행된다.
- tool 결과를 받은 뒤 fake LLM의 최종 답변이 `AiOutput.content`에 저장된다.
- board allowlist 밖 tool call은 실행되지 않고 trace에 오류가 남는다.
- tool call이 4회를 넘으면 max iteration fallback이 적용된다.
- RAG source가 있으면 `AiOutputSource`가 생성된다.
- MCP source는 `metadata_json.mcp_sources`에 저장된다.

### smoke 수준 테스트

개발 seed 데이터 기준 확인:

```powershell
cd backend
python ..\scripts\seed_dev_data.py
python ..\scripts\reindex_content_chunks.py
```

서버 실행 후 API를 호출한다.

```http
POST /api/v1/posts/{post_id}/ai/agent-answer
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "message": "이 게시글 기준으로 참고할 만한 근거를 찾아서 정리해줘.",
  "top_k": 5,
  "include_mcp": true
}
```

이후 기존 방식처럼 AI output을 조회한다.

```http
GET /api/v1/ai/outputs/{ai_output_id}
```

확인할 응답 요소:

- `status`가 `REQUESTED -> PROCESSING -> GENERATED`로 변한다.
- `output_type`이 `AGENT_ANSWER`다.
- `content`에 최종 답변이 들어 있다.
- RAG를 사용한 경우 `sources`가 들어 있다.
- MCP를 사용한 경우 `metadata_json.agent_trace` 또는 `metadata_json.mcp_sources`에 기록이 있다.

## 11. 한계와 다음 개선 방향

v1 agent는 의도적으로 단순하게 시작한다.

먼저 커스텀 while-loop agent로 구현하고, LangGraph는 나중에 도입한다.
현재 필요한 것은 복잡한 상태 그래프가 아니라 다음 세 가지이기 때문이다.

- 게시판별 tool allowlist
- tool call 반복 제어
- AiOutput 저장과 source 추적

추후 개선 방향은 다음과 같다.

- LangGraph로 상태를 명시적으로 분리한다.
- agent trace를 별도 테이블로 분리한다.
- MCP tool을 상품 검색 외의 링크 미리보기나 공식 정보 조회로 확장한다.
- tool 선택 품질을 평가하는 테스트셋을 만든다.
- RAG retriever에 hybrid search나 reranker를 추가한다.
- streaming 응답으로 agent 진행 상태를 화면에 보여준다.
- 사용자별 선호 태그나 가격대를 반영한 개인화 추천으로 확장한다.

가장 중요한 원칙은 기존과 같다.
AI 답변은 사용자 댓글과 분리해서 저장하고, 근거가 부족할 때는 지어내지 않는다.
agent는 이 원칙을 깨는 기능이 아니라, 기존 RAG/MCP 도구를 더 유연하게 선택하게 해 주는 얇은 제어 계층이다.
