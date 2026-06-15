import { useEffect, useRef, useState } from "react";

import { useAgentAnswer } from "../../hooks/useAgentAnswer";
import { useAgentFollowUps } from "../../hooks/useAgentFollowUps";
import Button from "../common/Button";
import AiSourceList from "./AiSourceList";


const DEFAULT_MESSAGE_BY_BOARD = {
  REVIEW: "Find similar reviews and useful official product candidates for this post.",
  QUESTION: "게시글 제목과 본문 내용을 바탕으로 과거 질문/댓글 근거를 찾아 답변을 작성해 주세요.",
  PURCHASE_HELP: "Use review evidence to summarize pros, cautions, and purchase considerations.",
};

const QUESTION_AUTO_RUN_KEYS = new Set();


function AgentAnswerBox({
  autoRunVersion = "",
  boardCode,
  currentUser,
  onSelectPost,
  postId,
}) {
  const autoRunKeyRef = useRef("");
  const [includeMcp, setIncludeMcp] = useState(true);
  const [message, setMessage] = useState(
    DEFAULT_MESSAGE_BY_BOARD[boardCode] || "",
  );
  const [followUpMessage, setFollowUpMessage] = useState("");
  const {
    agentOutput,
    errorMessage,
    isPolling,
    isRequesting,
    submitAgentAnswer,
  } = useAgentAnswer(postId);
  const {
    hasRunningTurn,
    submitFollowUp,
    turns: followUpTurns,
  } = useAgentFollowUps(postId);

  useEffect(() => {
    setMessage(DEFAULT_MESSAGE_BY_BOARD[boardCode] || "");
    setIncludeMcp(true);
  }, [boardCode, postId]);

  const isWorking =
    isRequesting ||
    isPolling ||
    agentOutput?.status === "REQUESTED" ||
    agentOutput?.status === "PROCESSING";
  const isQuestionBoard = boardCode === "QUESTION";
  const canRequest = Boolean(currentUser) && !isWorking && message.trim();
  const canUseMcp = boardCode === "REVIEW" || boardCode === "PURCHASE_HELP";
  const canShowFollowUpForm = Boolean(
    isQuestionBoard && currentUser && agentOutput?.content,
  );
  const canSubmitFollowUp = Boolean(
    canShowFollowUpForm &&
      !isWorking &&
      !hasRunningTurn &&
      followUpMessage.trim(),
  );
  const mcpSources = extractMcpSources(agentOutput);

  useEffect(() => {
    autoRunKeyRef.current = "";
  }, [boardCode, postId]);

  useEffect(() => {
    if (!isQuestionBoard || !currentUser || isWorking || agentOutput) {
      return;
    }

    const autoRunKey = `${postId}:${currentUser.id}:${autoRunVersion}`;
    if (
      autoRunKeyRef.current === autoRunKey ||
      QUESTION_AUTO_RUN_KEYS.has(autoRunKey)
    ) {
      return;
    }

    autoRunKeyRef.current = autoRunKey;
    QUESTION_AUTO_RUN_KEYS.add(autoRunKey);
    submitAgentAnswer({
      includeMcp: false,
      message,
      topK: 5,
    });
  }, [
    agentOutput,
    currentUser,
    isQuestionBoard,
    isWorking,
    message,
    autoRunVersion,
    postId,
    submitAgentAnswer,
  ]);

  async function handleFollowUpSubmit(event) {
    event.preventDefault();

    if (!canSubmitFollowUp) {
      return;
    }

    const submittedMessage = followUpMessage.trim();
    const requestMessage = buildFollowUpAgentMessage({
      initialAnswer: agentOutput?.content || "",
      previousTurns: followUpTurns,
      question: submittedMessage,
    });

    setFollowUpMessage("");
    await submitFollowUp({
      displayQuestion: submittedMessage,
      includeMcp: false,
      message: requestMessage,
      topK: 5,
    });
  }

  return (
    <section className="ai-answer-section" aria-labelledby="agent-answer-title">
      <div className="ai-answer-heading">
        <div>
          {!isQuestionBoard && <p className="eyebrow">Function Calling Agent</p>}
          <div className="ai-answer-title-row">
            <h3 id="agent-answer-title">
              {isQuestionBoard ? "AI 답변" : "Post Agent Answer"}
            </h3>
            {isQuestionBoard && (
              <span className="ai-answer-description">
                과거 질문글에 달린 댓글 답변을 기반으로 작성한 답변입니다.
              </span>
            )}
          </div>
        </div>
        {!isQuestionBoard && (
          <Button
            disabled={!canRequest}
            isLoading={isWorking}
            onClick={() =>
              submitAgentAnswer({
                includeMcp: canUseMcp && includeMcp,
                message,
                topK: 5,
              })
            }
          >
            Run Agent
          </Button>
        )}
      </div>

      {!currentUser && (
        <p className="empty-text">Log in to run the post-context agent.</p>
      )}

      {!isQuestionBoard && (
        <label className="agent-message-field">
          <span>Request</span>
          <textarea
            disabled={isWorking}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            value={message}
          />
        </label>
      )}

      {canUseMcp && (
        <label className="ai-option-row">
          <input
            checked={includeMcp}
            disabled={isWorking}
            onChange={(event) => setIncludeMcp(event.target.checked)}
            type="checkbox"
          />
          Allow official product candidate search
        </label>
      )}

      {errorMessage && <p className="form-message error">{errorMessage}</p>}

      {isWorking && (
        <p className="ai-answer-generating">AI 답변 생성중</p>
      )}

      {agentOutput?.content && isQuestionBoard && (
        <div
          className={[
            "ai-answer-content",
            "ai-question-answer-card",
            agentOutput.status === "FAILED" ? "failed" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <AnswerLines content={agentOutput.content} />

          {canShowFollowUpForm && (
            <div className="ai-follow-up-thread">
              {followUpTurns.map((turn) => (
                <FollowUpTurn key={turn.localId} turn={turn} />
              ))}

              <form className="ai-follow-up-form" onSubmit={handleFollowUpSubmit}>
                <input
                  aria-label="AI에게 추가 질문하기"
                  disabled={isWorking || hasRunningTurn}
                  maxLength={500}
                  onChange={(event) => setFollowUpMessage(event.target.value)}
                  placeholder="AI에게 추가 질문하기"
                  type="text"
                  value={followUpMessage}
                />
                <Button
                  disabled={!canSubmitFollowUp}
                  isLoading={hasRunningTurn}
                  type="submit"
                >
                  실행
                </Button>
              </form>
            </div>
          )}
        </div>
      )}

      {agentOutput?.content && !isQuestionBoard && (
        <AnswerContent
          content={agentOutput.content}
          isFailed={agentOutput.status === "FAILED"}
        />
      )}

      {agentOutput?.status === "FAILED" && agentOutput.error_message && (
        <p className="form-message error">{agentOutput.error_message}</p>
      )}

      {!isQuestionBoard && (
        <AiSourceList
          onSelectPost={onSelectPost}
          sources={agentOutput?.sources || []}
        />
      )}

      {!isQuestionBoard && <McpSourceList sources={mcpSources} />}
    </section>
  );
}


function buildFollowUpAgentMessage({ initialAnswer, previousTurns, question }) {
  const latestCompletedTurn = [...previousTurns]
    .reverse()
    .find((turn) => turn.output?.content);
  const contextParts = [
    "질문 게시판 AI 답변의 후속 질문입니다.",
    `처음 AI 답변:\n${truncateText(initialAnswer, 220)}`,
  ];

  if (latestCompletedTurn) {
    contextParts.push(
      `직전 추가 질문:\n${truncateText(latestCompletedTurn.question, 120)}`,
      `직전 AI 답변:\n${truncateText(latestCompletedTurn.output.content, 220)}`,
    );
  }

  contextParts.push(
    "이전 답변의 흐름을 이어가되, 필요한 경우 과거 질문글 댓글 RAG 근거를 다시 확인해 답변해 주세요.",
  );

  const questionBlock = `이번 추가 질문:\n${question}`;
  const remainingLength = Math.max(0, 950 - questionBlock.length - 2);
  const contextBlock = contextParts.join("\n\n").slice(0, remainingLength);

  return [questionBlock, contextBlock].filter(Boolean).join("\n\n");
}


function truncateText(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value || "";
  }

  return `${value.slice(0, maxLength - 3)}...`;
}


function FollowUpTurn({ turn }) {
  const isWorking =
    turn.isRequesting || turn.isPolling || isOutputPending(turn.output);

  return (
    <div className="ai-follow-up-turn">
      <div className="ai-follow-up-question">
        <span>추가 질문</span>
        <p>{turn.question}</p>
      </div>

      {isWorking && <p className="ai-answer-generating">AI 답변 생성중</p>}

      {turn.output?.content && (
        <AnswerContent
          content={turn.output.content}
          isFailed={turn.output.status === "FAILED"}
          variant="follow-up"
        />
      )}

      {turn.errorMessage && (
        <p className="form-message error">{turn.errorMessage}</p>
      )}

      {turn.output?.status === "FAILED" && turn.output.error_message && (
        <p className="form-message error">{turn.output.error_message}</p>
      )}
    </div>
  );
}


function AnswerContent({ content, isFailed = false, variant = "" }) {
  return (
    <div
      className={[
        "ai-answer-content",
        isFailed ? "failed" : "",
        variant ? `ai-answer-content-${variant}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <AnswerLines content={content} />
    </div>
  );
}


function AnswerLines({ content }) {
  return content.split("\n").map((line, index) => (
    <p key={`${line}-${index}`}>{line}</p>
  ));
}


function isOutputPending(output) {
  return output?.status === "REQUESTED" || output?.status === "PROCESSING";
}


function McpSourceList({ sources }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mcp-source-list">
      <h4>Official product candidates</h4>
      {sources.map((source, sourceIndex) => (
        <div key={`${source.query}-${sourceIndex}`} className="mcp-source-group">
          <p className="mcp-source-query">Query: {source.query}</p>
          <ul>
            {(source.candidates || []).map((candidate, candidateIndex) => (
              <li key={`${candidate.link || candidate.title}-${candidateIndex}`}>
                {candidate.link ? (
                  <a href={candidate.link} rel="noreferrer" target="_blank">
                    {candidate.title || candidate.link}
                  </a>
                ) : (
                  <span>{candidate.title || "Untitled candidate"}</span>
                )}
                <small>{formatCandidateMeta(candidate)}</small>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}


function extractMcpSources(agentOutput) {
  const sources = agentOutput?.metadata_json?.mcp_sources;
  return Array.isArray(sources) ? sources : [];
}


function formatCandidateMeta(candidate) {
  const parts = [
    candidate.mall_name,
    formatPrice(candidate.lprice),
  ].filter(Boolean);

  return parts.join(" · ");
}


function formatPrice(value) {
  if (typeof value !== "number") {
    return "";
  }

  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value);
}


export default AgentAnswerBox;
