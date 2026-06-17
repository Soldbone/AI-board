import { useState } from "react";

import Button from "../common/Button";
import { useAiAnswer } from "../../hooks/useAiAnswer";
import AiSourceList from "./AiSourceList";


function PurchaseSummaryBox({ currentUser, onSelectPost, postId }) {
  const [includeSimilarPriceRange, setIncludeSimilarPriceRange] = useState(true);
  const {
    aiOutput,
    errorMessage,
    isPolling,
    isRequesting,
    requestPurchaseSummaryAnswer,
  } = useAiAnswer(postId);

  const isWorking =
    isRequesting ||
    isPolling ||
    aiOutput?.status === "REQUESTED" ||
    aiOutput?.status === "PROCESSING";
  const canRequest = Boolean(currentUser) && !isWorking;

  return (
    <section className="ai-answer-section" aria-labelledby="purchase-summary-title">
      <div className="ai-answer-heading">
        <div>
          <p className="eyebrow">RAG Purchase Helper</p>
          <h3 id="purchase-summary-title">AI Purchase Summary</h3>
        </div>
        <Button
          disabled={!canRequest}
          isLoading={isWorking}
          onClick={() =>
            requestPurchaseSummaryAnswer({
              includeSimilarPriceRange,
              topK: 5,
            })
          }
        >
          Generate
        </Button>
      </div>

      {!currentUser && (
        <p className="empty-text">Log in to generate an AI purchase summary.</p>
      )}

      <label className="ai-option-row">
        <input
          checked={includeSimilarPriceRange}
          disabled={isWorking}
          onChange={(event) =>
            setIncludeSimilarPriceRange(event.target.checked)
          }
          type="checkbox"
        />
        Include similar price range reviews
      </label>

      {errorMessage && <p className="form-message error">{errorMessage}</p>}

      {isWorking && (
        <p className="empty-text">Searching indexed reviews for purchase evidence.</p>
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


export default PurchaseSummaryBox;
