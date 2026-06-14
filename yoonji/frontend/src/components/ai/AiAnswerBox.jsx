import Button from "../common/Button";
import { useAiAnswer } from "../../hooks/useAiAnswer";
import AiSourceList from "./AiSourceList";


function AiAnswerBox({ currentUser, onSelectPost, postId }) {
  const {
    aiOutput,
    errorMessage,
    isPolling,
    isRequesting,
    requestReferenceAnswer,
  } = useAiAnswer(postId);

  const isWorking =
    isRequesting ||
    isPolling ||
    aiOutput?.status === "REQUESTED" ||
    aiOutput?.status === "PROCESSING";
  const canRequest = Boolean(currentUser) && !isWorking;

  return (
    <section className="ai-answer-section" aria-labelledby="ai-answer-title">
      <div className="ai-answer-heading">
        <div>
          <p className="eyebrow">RAG Reference</p>
          <h3 id="ai-answer-title">AI Reference Answer</h3>
        </div>
        <Button
          disabled={!canRequest}
          isLoading={isWorking}
          onClick={() => requestReferenceAnswer({ topK: 5 })}
        >
          Generate
        </Button>
      </div>

      {!currentUser && (
        <p className="empty-text">Log in to generate an AI reference answer.</p>
      )}

      {errorMessage && <p className="form-message error">{errorMessage}</p>}

      {isWorking && (
        <p className="empty-text">Searching indexed questions and comments.</p>
      )}

      {aiOutput?.content && (
        <div
          className={[
            "ai-answer-content",
            aiOutput.status === "FAILED" ? "failed" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {aiOutput.content.split("\n").map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
      )}

      {aiOutput?.status === "FAILED" && aiOutput.error_message && (
        <p className="form-message error">{aiOutput.error_message}</p>
      )}

      <AiSourceList
        onSelectPost={onSelectPost}
        sources={aiOutput?.sources || []}
      />
    </section>
  );
}


export default AiAnswerBox;
