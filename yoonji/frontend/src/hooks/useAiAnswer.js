import { useCallback, useEffect, useRef, useState } from "react";

import {
  getAiOutput,
  requestQuestionReferenceAnswer,
} from "../api/aiApi";
import { getApiErrorMessage } from "./usePosts";


const FINAL_STATUSES = new Set(["GENERATED", "FAILED"]);
const POLL_INTERVAL_MS = 1500;


export function useAiAnswer(postId) {
  const pollingTimerRef = useRef(null);
  const [aiOutput, setAiOutput] = useState(null);
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

  const pollAiOutput = useCallback(
    (aiOutputId) => {
      clearPolling();
      setIsPolling(true);

      async function loadLatestOutput() {
        try {
          const response = await getAiOutput(aiOutputId);
          setAiOutput(response);

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

  const requestReferenceAnswer = useCallback(
    async ({ topK = 5 } = {}) => {
      if (!postId) {
        return null;
      }

      setIsRequesting(true);
      setErrorMessage("");

      try {
        const response = await requestQuestionReferenceAnswer(postId, {
          top_k: topK,
        });
        setAiOutput(response);

        if (!FINAL_STATUSES.has(response.status)) {
          pollAiOutput(response.id);
        }

        return response;
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
        return null;
      } finally {
        setIsRequesting(false);
      }
    },
    [pollAiOutput, postId],
  );

  useEffect(() => {
    setAiOutput(null);
    setErrorMessage("");
    clearPolling();
  }, [clearPolling, postId]);

  useEffect(() => clearPolling, [clearPolling]);

  return {
    aiOutput,
    clearError: () => setErrorMessage(""),
    errorMessage,
    isPolling,
    isRequesting,
    requestReferenceAnswer,
  };
}
