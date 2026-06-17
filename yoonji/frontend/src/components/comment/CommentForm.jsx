import { useState } from "react";


function CommentForm({ currentUser, isSubmitting = false, onSubmit }) {
  const [content, setContent] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmed = content.trim();

    if (!trimmed) {
      setErrorMessage("댓글 내용을 입력해 주세요.");
      return;
    }

    setErrorMessage("");

    try {
      await onSubmit(trimmed);
      setContent("");
    } catch {
      // The hook exposes the API error near the comment area.
    }
  }

  if (!currentUser) {
    return (
      <div className="comment-form-panel">
        <p className="empty-text">로그인하면 댓글을 작성할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <form className="comment-form" onSubmit={handleSubmit}>
      <label>
        댓글 작성
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={4}
          placeholder="댓글을 입력하세요"
          disabled={isSubmitting}
        />
      </label>

      <div className="comment-form-actions">
        <button type="submit" disabled={isSubmitting}>
          댓글 등록
        </button>
      </div>

      {errorMessage && <p className="form-message error">{errorMessage}</p>}
    </form>
  );
}


export default CommentForm;
