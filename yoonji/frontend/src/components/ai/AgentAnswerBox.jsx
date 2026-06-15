import { useEffect, useState } from "react";

import { useAgentAnswer } from "../../hooks/useAgentAnswer";
import Button from "../common/Button";
import AiSourceList from "./AiSourceList";


const DEFAULT_MESSAGE_BY_BOARD = {
  REVIEW: "Find similar reviews and useful official product candidates for this post.",
  QUESTION: "Find past question and comment evidence, then draft a reference answer.",
  PURCHASE_HELP: "Use review evidence to summarize pros, cautions, and purchase considerations.",
};


function AgentAnswerBox({ boardCode, currentUser, onSelectPost, postId }) {
  const [includeMcp, setIncludeMcp] = useState(true);
  const [message, setMessage] = useState(
    DEFAULT_MESSAGE_BY_BOARD[boardCode] || "",
  );
  const {
    agentOutput,
    errorMessage,
    isPolling,
    isRequesting,
    submitAgentAnswer,
  } = useAgentAnswer(postId);

  useEffect(() => {
    setMessage(DEFAULT_MESSAGE_BY_BOARD[boardCode] || "");
    setIncludeMcp(true);
  }, [boardCode, postId]);

  const isWorking =
    isRequesting ||
    isPolling ||
    agentOutput?.status === "REQUESTED" ||
    agentOutput?.status === "PROCESSING";
  const canRequest = Boolean(currentUser) && !isWorking && message.trim();
  const canUseMcp = boardCode === "REVIEW" || boardCode === "PURCHASE_HELP";
  const mcpSources = extractMcpSources(agentOutput);

  return (
    <section className="ai-answer-section" aria-labelledby="agent-answer-title">
      <div className="ai-answer-heading">
        <div>
          <p className="eyebrow">Function Calling Agent</p>
          <h3 id="agent-answer-title">Post Agent Answer</h3>
        </div>
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
      </div>

      {!currentUser && (
        <p className="empty-text">Log in to run the post-context agent.</p>
      )}

      <label className="agent-message-field">
        <span>Request</span>
        <textarea
          disabled={isWorking}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          value={message}
        />
      </label>

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
        <p className="empty-text">
          Choosing tools, collecting evidence, and drafting the final answer.
        </p>
      )}

      {agentOutput?.content && (
        <div
          className={[
            "ai-answer-content",
            agentOutput.status === "FAILED" ? "failed" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {agentOutput.content.split("\n").map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
      )}

      {agentOutput?.status === "FAILED" && agentOutput.error_message && (
        <p className="form-message error">{agentOutput.error_message}</p>
      )}

      <AiSourceList
        onSelectPost={onSelectPost}
        sources={agentOutput?.sources || []}
      />

      <McpSourceList sources={mcpSources} />
    </section>
  );
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

