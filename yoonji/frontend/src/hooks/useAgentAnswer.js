import { useCallback, useEffect, useRef, useState } from "react";

import { getAiOutput, requestAgentAnswer } from "../api/aiApi";
import { getApiErrorMessage } from "./usePosts";


const FINAL_STATUSES = new Set(["GENERATED", "FAILED"]);
const POLL_INTERVAL_MS = 1500;


export function useAgentAnswer(postId) {
  const pollingTimerRef = useRef(null);
  const [agentOutput, setAgentOutput] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPolling, setIsPolling] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const clearPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      window.clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    setIsPolling(false);
  }, []);

  const pollAgentOutput = useCallback(
    (aiOutputId) => {
      clearPolling();
      setIsPolling(true);

      async function loadLatestOutput() {
        try {
          const response = await getAiOutput(aiOutputId);
          setAgentOutput(response);

          if (FINAL_STATUSES.has(response.status)) {
            setIsPolling(false);
            pollingTimerRef.current = null;
            return;
          }

          pollingTimerRef.current = window.setTimeout(
            loadLatestOutput,
            POLL_INTERVAL_MS,
          );
        } catch (error) {
          setErrorMessage(getApiErrorMessage(error));
          setIsPolling(false);
          pollingTimerRef.current = null;
        }
      }

      pollingTimerRef.current = window.setTimeout(loadLatestOutput, 600);
    },
    [clearPolling],
  );

  const submitAgentAnswer = useCallback(
    async ({ includeMcp = true, message, topK = 5 }) => {
      if (!postId || !message?.trim()) {
        return null;
      }

      setIsRequesting(true);
      setErrorMessage("");

      try {
        const response = await requestAgentAnswer(postId, {
          include_mcp: includeMcp,
          message: message.trim(),
          top_k: topK,
        });
        setAgentOutput(response);

        if (!FINAL_STATUSES.has(response.status)) {
          pollAgentOutput(response.id);
        }

        return response;
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
        return null;
      } finally {
        setIsRequesting(false);
      }
    },
    [pollAgentOutput, postId],
  );

  useEffect(() => {
    setAgentOutput(null);
    setErrorMessage("");
    clearPolling();
  }, [clearPolling, postId]);

  useEffect(() => clearPolling, [clearPolling]);

  return {
    agentOutput,
    clearError: () => setErrorMessage(""),
    errorMessage,
    isPolling,
    isRequesting,
    submitAgentAnswer,
  };
}

