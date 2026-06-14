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
