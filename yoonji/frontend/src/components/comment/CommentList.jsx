import { useState } from "react";


function CommentList({
  comments = [],
  currentUser,
  data,
  errorMessage = "",
  isLoading = false,
  isSubmitting = false,
  onDelete,
  onPageChange,
  onUpdate,
  page,
}) {
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editErrorMessage, setEditErrorMessage] = useState("");

  function startEdit(comment) {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
    setEditErrorMessage("");
  }

  function cancelEdit() {
    setEditingCommentId(null);
    setEditContent("");
    setEditErrorMessage("");
  }

  async function handleUpdate(commentId) {
    const trimmed = editContent.trim();

    if (!trimmed) {
      setEditErrorMessage("댓글 내용을 입력해 주세요.");
      return;
    }

    setEditErrorMessage("");

    try {
      await onUpdate(commentId, trimmed);
      cancelEdit();
    } catch {
      setEditErrorMessage("댓글을 수정하지 못했습니다.");
    }
  }

  async function handleDelete(commentId) {
    const confirmed = window.confirm("댓글을 삭제할까요?");

    if (!confirmed) {
      return;
    }

    try {
      await onDelete(commentId);
    } catch {
      // The hook exposes the API error near the comment area.
    }
  }

  if (isLoading) {
    return <p className="empty-text">댓글을 불러오는 중입니다.</p>;
  }

  if (errorMessage) {
    return <p className="form-message error">{errorMessage}</p>;
  }

  if (comments.length === 0) {
    return <p className="empty-text">아직 댓글이 없습니다.</p>;
  }

  return (
    <div className="comment-list">
      {comments.map((comment) => {
        const isAuthor = currentUser?.id === comment.author.id;
        const isEditing = editingCommentId === comment.id;

        return (
          <article className="comment-card" key={comment.id}>
            <header className="comment-card-header">
              <div>
                <strong>{comment.author.nickname}</strong>
                <span>{formatDate(comment.created_at)}</span>
              </div>

              {isAuthor && !isEditing && (
                <div className="comment-card-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => startEdit(comment)}
                    disabled={isSubmitting}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => handleDelete(comment.id)}
                    disabled={isSubmitting}
                  >
                    삭제
                  </button>
                </div>
              )}
            </header>

            {isEditing ? (
              <div className="comment-edit-form">
                <textarea
                  value={editContent}
                  onChange={(event) => setEditContent(event.target.value)}
                  rows={4}
                  disabled={isSubmitting}
                />
                <div className="comment-form-actions">
                  <button
                    type="button"
                    onClick={() => handleUpdate(comment.id)}
                    disabled={isSubmitting}
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={cancelEdit}
                    disabled={isSubmitting}
                  >
                    취소
                  </button>
                </div>
                {editErrorMessage && (
                  <p className="form-message error">{editErrorMessage}</p>
                )}
              </div>
            ) : (
              <p className="comment-content">{comment.content}</p>
            )}
          </article>
        );
      })}

      {data && (
        <div className="comment-pagination" aria-label="comment pagination">
          <button
            type="button"
            className="secondary-button"
            disabled={page <= 1 || isSubmitting}
            onClick={() => onPageChange(page - 1)}
          >
            이전
          </button>
          <span>
            {data.page} / 총 {data.total}개
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={!data.has_next || isSubmitting}
            onClick={() => onPageChange(page + 1)}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}


function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}


export default CommentList;
