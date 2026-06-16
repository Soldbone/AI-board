import { useCallback, useEffect, useRef, useState } from "react";

import { getAiOutput, requestAgentAnswer } from "../api/aiApi";
import { getApiErrorMessage } from "./usePosts";


const FINAL_STATUSES = new Set(["GENERATED", "FAILED"]);
const POLL_INTERVAL_MS = 1500;


function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}


function isOutputPending(output) {
  return output?.status === "REQUESTED" || output?.status === "PROCESSING";
}


export function useAgentFollowUps(postId) {
  const pollingTimersRef = useRef(new Map());
  const [turns, setTurns] = useState([]);

  const clearTurnTimer = useCallback((localId) => {
    const timerId = pollingTimersRef.current.get(localId);

    if (timerId) {
      window.clearTimeout(timerId);
      pollingTimersRef.current.delete(localId);
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    pollingTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    pollingTimersRef.current.clear();
  }, []);

  const updateTurn = useCallback((localId, updater) => {
    setTurns((currentTurns) =>
      currentTurns.map((turn) =>
        turn.localId === localId ? updater(turn) : turn,
      ),
    );
  }, []);

  const pollFollowUpOutput = useCallback(
    (localId, aiOutputId) => {
      clearTurnTimer(localId);
      updateTurn(localId, (turn) => ({
        ...turn,
        isPolling: true,
      }));

      async function loadLatestOutput() {
        try {
          const response = await getAiOutput(aiOutputId);
          updateTurn(localId, (turn) => ({
            ...turn,
            output: response,
            errorMessage: "",
            isPolling: !FINAL_STATUSES.has(response.status),
          }));

          if (FINAL_STATUSES.has(response.status)) {
            pollingTimersRef.current.delete(localId);
            return;
          }

          const timerId = window.setTimeout(loadLatestOutput, POLL_INTERVAL_MS);
          pollingTimersRef.current.set(localId, timerId);
        } catch (error) {
          updateTurn(localId, (turn) => ({
            ...turn,
            errorMessage: getApiErrorMessage(error),
            isPolling: false,
          }));
          pollingTimersRef.current.delete(localId);
        }
      }

      const timerId = window.setTimeout(loadLatestOutput, 600);
      pollingTimersRef.current.set(localId, timerId);
    },
    [clearTurnTimer, updateTurn],
  );

  const submitFollowUp = useCallback(
    async ({ displayQuestion, includeMcp = false, message, topK = 5 }) => {
      if (!postId || !message?.trim()) {
        return null;
      }

      const localId = createLocalId();
      const requestMessage = message.trim();
      const question = (displayQuestion || requestMessage).trim();

      setTurns((currentTurns) => [
        ...currentTurns,
        {
          localId,
          question,
          output: null,
          errorMessage: "",
          isPolling: false,
          isRequesting: true,
        },
      ]);

      try {
        const response = await requestAgentAnswer(postId, {
          include_mcp: includeMcp,
          message: requestMessage,
          top_k: topK,
        });

        updateTurn(localId, (turn) => ({
          ...turn,
          output: response,
          errorMessage: "",
          isRequesting: false,
        }));

        if (!FINAL_STATUSES.has(response.status)) {
          pollFollowUpOutput(localId, response.id);
        }

        return response;
      } catch (error) {
        updateTurn(localId, (turn) => ({
          ...turn,
          errorMessage: getApiErrorMessage(error),
          isRequesting: false,
          isPolling: false,
        }));
        return null;
      }
    },
    [pollFollowUpOutput, postId, updateTurn],
  );

  useEffect(() => {
    setTurns([]);
    clearAllTimers();
  }, [clearAllTimers, postId]);

  useEffect(() => clearAllTimers, [clearAllTimers]);

  const hasRunningTurn = turns.some(
    (turn) => turn.isRequesting || turn.isPolling || isOutputPending(turn.output),
  );

  return {
    hasRunningTurn,
    submitFollowUp,
    turns,
  };
}
