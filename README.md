# AI-board

AI-board는 각 하위 폴더에서 서로 다른 주제의 게시판 서비스를 구현한 프로젝트입니다. 공통적으로 게시글, 댓글, 검색, 인증 같은 게시판 흐름을 바탕으로 RAG, MCP, Agent를 각 도메인에 맞게 연결하는 실험을 포함합니다.

## 하위 프로젝트 요약

| 프로젝트 | 요약 |
| --- | --- |
| `hyeok` | 동네 가게 Q&A 게시판입니다. 게시글과 댓글을 기반으로 유사 글을 찾고, MCP로 Naver 지역 검색을 호출하며, Agent가 DB 기반 평가와 장소 추천을 제공합니다. |
| `jiseob` | YouTube 영상 토론 게시판 Arena입니다. NestJS 백엔드 중심으로 영상 metadata/transcript 처리, 댓글 AI 분석, 자막 RAG 근거 검색, MCP tool boundary, Agent run, 댓글 스레드 요약과 관리자 API를 구현했습니다. |
| `kyujeong` | 냉장고/요리 추천 게시판입니다. NestJS, Prisma, PostgreSQL 기반으로 재료와 게시글 댓글 근거를 활용한 pgvector RAG 추천, 일반 AI 추천 fallback, 음식 영양 metadata MCP, 게시판 채팅형 Agent 흐름을 다룹니다. |
| `kyumin` | 게임 아이디어와 게임 리뷰를 공유하는 Potato maker 게시판입니다. FastAPI 기반으로 게임 아이디어 중복 확인 RAG, Video Games MCP/RAWG 연동, Agent 기반 아이디어 분석, 별점 리뷰 댓글을 제공합니다. |
| `yoonji` | 피규어 커뮤니티 게시판입니다. 후기, 질문, 구매 도움 게시판을 중심으로 이미지, 태그, 검색, RAG 기반 후기 추천, 구매 요약, MCP 상품 후보 검색, 게시글 맥락 Agent를 제공합니다. |

각 프로젝트의 상세 구조와 실행 방법은 각 하위 폴더의 README를 참고합니다.
