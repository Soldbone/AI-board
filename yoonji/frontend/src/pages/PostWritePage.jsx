import { useEffect, useState } from "react";

import { getBoards } from "../api/boardApi";
import { createPost } from "../api/postApi";
import PostForm from "../components/post/PostForm";
import { getApiErrorMessage } from "../hooks/usePosts";


function PostWritePage({
  currentUser,
  initialBoardCode = "",
  onCancel,
  onCreated,
}) {
  const [boards, setBoards] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isBoardLoading, setIsBoardLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadBoards() {
      setIsBoardLoading(true);
      setErrorMessage("");

      try {
        const response = await getBoards();

        if (!ignore) {
          setBoards(response.items);
        }
      } catch (error) {
        if (!ignore) {
          setBoards([]);
          setErrorMessage(getApiErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsBoardLoading(false);
        }
      }
    }

    loadBoards();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleSubmit(payload) {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const createdPost = await createPost(payload);
      onCreated(createdPost.id);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!currentUser) {
    return (
      <section className="page-section">
        <p className="form-message error">로그인한 사용자만 게시글을 작성할 수 있습니다.</p>
        <button type="button" className="secondary-button" onClick={onCancel}>
          목록으로
        </button>
      </section>
    );
  }

  return (
    <section className="page-section" aria-labelledby="post-write-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Write</p>
          <h2 id="post-write-title">게시글 작성</h2>
        </div>
      </div>

      {isBoardLoading ? (
        <p className="empty-text">게시판 정보를 불러오는 중입니다.</p>
      ) : (
        <PostForm
          boards={boards}
          initialBoardCode={initialBoardCode}
          isSubmitting={isSubmitting}
          onCancel={onCancel}
          onSubmit={handleSubmit}
        />
      )}

      {errorMessage && <p className="form-message error">{errorMessage}</p>}
    </section>
  );
}


export default PostWritePage;
