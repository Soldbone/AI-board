import { useEffect, useState } from "react";

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
  size = 20,
  sort = "latest",
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
  }, [boardCode, page, size, sort]);

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

  useEffect(() => {
    let ignore = false;

    async function loadPost() {
      if (!postId) {
        setPost(null);
        setIsLoading(false);
        setErrorMessage("");
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await getPost(postId);

        if (!ignore) {
          setPost(response);
        }
      } catch (error) {
        if (!ignore) {
          setPost(null);
          setErrorMessage(getApiErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadPost();

    return () => {
      ignore = true;
    };
  }, [postId]);

  return {
    errorMessage,
    isLoading,
    post,
  };
}
