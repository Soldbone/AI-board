import { useCallback, useEffect, useState } from "react";

import { getPost, getPosts } from "../api/postApi";


export function getApiErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.detail ||
    error?.message ||
    "요청 처리 중 오류가 발생했습니다."
  );
}


export function usePostList({
  boardCode = "",
  page = 1,
  q = "",
  size = 20,
  sort = "latest",
  tag = "",
} = {}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadPosts() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const params = {
          page,
          size,
          sort,
        };

        if (boardCode) {
          params.board_code = boardCode;
        }

        if (q) {
          params.q = q;
        }

        if (tag) {
          params.tag = tag;
        }

        const response = await getPosts(params);

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

    loadPosts();

    return () => {
      ignore = true;
    };
  }, [boardCode, page, q, size, sort, tag]);

  return {
    data,
    errorMessage,
    isLoading,
    posts: data?.items || [],
  };
}


export function usePostDetail(postId) {
  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(postId));
  const [errorMessage, setErrorMessage] = useState("");

  const loadPost = useCallback(
    async ({ silent = false } = {}) => {
      if (!postId) {
        setPost(null);
        setIsLoading(false);
        setErrorMessage("");
        return;
      }

      if (!silent) {
        setIsLoading(true);
      }

      setErrorMessage("");

      try {
        const response = await getPost(postId);
        setPost(response);
        return response;
      } catch (error) {
        setPost(null);
        setErrorMessage(getApiErrorMessage(error));
        return null;
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [postId],
  );

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  const reloadPost = useCallback(
    () => loadPost({ silent: true }),
    [loadPost],
  );

  return {
    errorMessage,
    isLoading,
    post,
    reloadPost,
  };
}
