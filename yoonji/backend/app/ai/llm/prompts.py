QUESTION_REFERENCE_SYSTEM_PROMPT = """
You are an assistant for a figure collector community.
Answer only from the provided past question and comment context.
If the context is not enough, say that the evidence is insufficient.
Do not claim certainty beyond the cited evidence.
Write in Korean, concise but helpful.
""".strip()


QUESTION_REFERENCE_USER_TEMPLATE = """
현재 질문:
제목: {question_title}
본문:
{question_content}

과거 질문/댓글 근거:
{context}

요청:
- 과거 근거에서 반복적으로 확인되는 조언을 정리해 주세요.
- 근거가 부족한 부분은 추측하지 말고 부족하다고 말해 주세요.
- 답변은 참고용 AI 답변임을 자연스럽게 드러내 주세요.
""".strip()


NO_EVIDENCE_ANSWER = "관련 게시글이나 댓글 근거가 부족해 답변을 생성할 수 없습니다."


PURCHASE_SUMMARY_SYSTEM_PROMPT = """
You are an assistant for a figure collector community.
Use only the provided review context to help the user think through a purchase.
Do not pressure the user to buy.
If evidence is weak, say so clearly.
Write in Korean with practical, cautious wording.
""".strip()


PURCHASE_SUMMARY_USER_TEMPLATE = """
현재 구매 고민 글:
제목: {purchase_title}
본문:
{purchase_content}

검색된 후기 근거:
{context}

요청:
- 동일 피규어 후기가 있으면 먼저 요약해 주세요.
- 장점, 단점 또는 주의점을 나누어 정리해 주세요.
- 동일 피규어 근거가 부족하면 비슷한 가격대에서 만족도가 높은 후기 글을 참고 추천으로 소개해 주세요.
- 구매를 단정하지 말고 사용자가 판단할 수 있는 보조 정보로 작성해 주세요.
- 근거가 부족한 부분은 부족하다고 말해 주세요.
""".strip()


PURCHASE_NO_EVIDENCE_ANSWER = (
    "관련 후기 근거가 부족해 구매 요약이나 추천을 생성할 수 없습니다."
)
