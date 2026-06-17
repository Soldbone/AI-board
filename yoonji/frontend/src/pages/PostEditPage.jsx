import { useEffect, useState } from "react";

import { getBoards } from "../api/boardApi";
import { updatePost } from "../api/postApi";
import PostForm from "../components/post/PostForm";
import { getApiErrorMessage, usePostDetail } from "../hooks/usePosts";


function PostEditPage({ currentUser, onCancel, onSaved, postId }) {
  const { errorMessage: postErrorMessage, isLoading, post } = usePostDetail(postId);
  const [boards, setBoards] = useState([]);
  const [boardErrorMessage, setBoardErrorMessage] = useState("");
  const [submitErrorMessage, setSubmitErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadBoards() {
      try {
        const response = await getBoards();

        if (!ignore) {
          setBoards(response.items);
        }
      } catch (error) {
        if (!ignore) {
          setBoards([]);
          setBoardErrorMessage(getApiErrorMessage(error));
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
    setSubmitErrorMessage("");

    try {
      const updatedPost = await updatePost(postId, payload);
      onSaved(updatedPost.id);
    } catch (error) {
      setSubmitErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!currentUser) {
    return (
      <section className="page-section">
        <p className="form-message error">로그인한 사용자만 게시글을 수정할 수 있습니다.</p>
        <button type="button" className="secondary-button" onClick={onCancel}>
          돌아가기
        </button>
      </section>
    );
  }

  if (isLoading) {
    return <p className="empty-text">게시글을 불러오는 중입니다.</p>;
  }

  if (postErrorMessage) {
    return (
      <section className="page-section">
        <p className="form-message error">{postErrorMessage}</p>
        <button type="button" className="secondary-button" onClick={onCancel}>
          돌아가기
        </button>
      </section>
    );
  }

  if (!post) {
    return (
      <section className="page-section">
        <p className="empty-text">수정할 게시글을 선택해 주세요.</p>
      </section>
    );
  }

  if (post.author.id !== currentUser.id) {
    return (
      <section className="page-section">
        <p className="form-message error">작성자만 게시글을 수정할 수 있습니다.</p>
        <button type="button" className="secondary-button" onClick={onCancel}>
          돌아가기
        </button>
      </section>
    );
  }

  return (
    <section className="page-section" aria-labelledby="post-edit-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Edit</p>
          <h2 id="post-edit-title">게시글 수정</h2>
        </div>
      </div>

      <PostForm
        boards={boards}
        initialPost={post}
        isSubmitting={isSubmitting}
        mode="edit"
        onCancel={onCancel}
        onSubmit={handleSubmit}
      />

      {boardErrorMessage && (
        <p className="form-message error">{boardErrorMessage}</p>
      )}
      {submitErrorMessage && (
        <p className="form-message error">{submitErrorMessage}</p>
      )}
    </section>
  );
}


export default PostEditPage;
