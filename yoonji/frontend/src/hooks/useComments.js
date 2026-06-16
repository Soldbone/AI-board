import { useCallback, useEffect, useState } from "react";

import {
  createComment as createCommentRequest,
  deleteComment as deleteCommentRequest,
  getComments,
  updateComment as updateCommentRequest,
} from "../api/commentApi";
import { getApiErrorMessage } from "./usePosts";


const DEFAULT_PAGE_SIZE = 50;


export function useComments(postId, { pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(Boolean(postId));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionErrorMessage, setActionErrorMessage] = useState("");

  const loadComments = useCallback(
    async (targetPage = page) => {
      if (!postId) {
        setData(null);
        setIsLoading(false);
        setErrorMessage("");
        return null;
      }

      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await getComments(postId, {
          page: targetPage,
          size: pageSize,
        });

        setData(response);
        return response;
      } catch (error) {
        const message = getApiErrorMessage(error);
        setData(null);
        setErrorMessage(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [page, pageSize, postId],
  );

  useEffect(() => {
    let ignore = false;

    async function loadInitialComments() {
      if (!postId) {
        setData(null);
        setIsLoading(false);
        setErrorMessage("");
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await getComments(postId, {
          page,
          size: pageSize,
        });

        if (!ignore) {
          setData(response);
        }
      } catch (error) {
        if (!ignore) {
          setData(null);
          setErrorMessage(getApiErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadInitialComments();

    return () => {
      ignore = true;
    };
  }, [page, pageSize, postId]);

  useEffect(() => {
    setPage(1);
  }, [postId]);

  const createComment = useCallback(
    async (content) => {
      if (!postId) {
        return null;
      }

      setIsSubmitting(true);
      setActionErrorMessage("");

      try {
        const createdComment = await createCommentRequest(postId, { content });
        const nextTotal = (data?.total || 0) + 1;
        const targetPage = Math.max(1, Math.ceil(nextTotal / pageSize));

        if (targetPage !== page) {
          setPage(targetPage);
        } else {
          await loadComments(targetPage);
        }

        return createdComment;
      } catch (error) {
        const message = getApiErrorMessage(error);
        setActionErrorMessage(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [data?.total, loadComments, page, pageSize, postId],
  );

  const updateComment = useCallback(
    async (commentId, content) => {
      setIsSubmitting(true);
      setActionErrorMessage("");

      try {
        const updatedComment = await updateCommentRequest(commentId, { content });
        await loadComments(page);
        return updatedComment;
      } catch (error) {
        const message = getApiErrorMessage(error);
        setActionErrorMessage(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [loadComments, page],
  );

  const deleteComment = useCallback(
    async (commentId) => {
      setIsSubmitting(true);
      setActionErrorMessage("");

      try {
        await deleteCommentRequest(commentId);

        const nextTotal = Math.max((data?.total || 1) - 1, 0);
        const targetPage = Math.min(
          page,
          Math.max(1, Math.ceil(nextTotal / pageSize)),
        );

        if (targetPage !== page) {
          setPage(targetPage);
        } else {
          await loadComments(targetPage);
        }
      } catch (error) {
        const message = getApiErrorMessage(error);
        setActionErrorMessage(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [data?.total, loadComments, page, pageSize],
  );

  return {
    actionErrorMessage,
    comments: data?.items || [],
    createComment,
    data,
    deleteComment,
    errorMessage,
    isLoading,
    isSubmitting,
    loadComments,
    page,
    pageSize,
    setPage,
    updateComment,
  };
}
