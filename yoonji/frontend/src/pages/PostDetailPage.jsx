import { useState } from "react";

import { API_BASE_URL } from "../api/client";
import { deletePost } from "../api/postApi";
import CommentForm from "../components/comment/CommentForm";
import CommentList from "../components/comment/CommentList";
import { useComments } from "../hooks/useComments";
import { getApiErrorMessage, usePostDetail } from "../hooks/usePosts";


function PostDetailPage({
  currentUser,
  onBackHome,
  onBackToList,
  onDeleted,
  onEditPost,
  postId,
}) {
  const { errorMessage, isLoading, post, reloadPost } = usePostDetail(postId);
  const comments = useComments(postId);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm("게시글을 삭제할까요?");

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setDeleteErrorMessage("");

    try {
      await deletePost(post.id);
      onDeleted();
    } catch (error) {
      setDeleteErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleCreateComment(content) {
    await comments.createComment(content);
    await reloadPost();
  }

  async function handleUpdateComment(commentId, content) {
    await comments.updateComment(commentId, content);
  }

  async function handleDeleteComment(commentId) {
    await comments.deleteComment(commentId);
    await reloadPost();
  }

  if (isLoading) {
    return <p className="empty-text">게시글을 불러오는 중입니다.</p>;
  }

  if (errorMessage) {
    return (
      <section className="page-section">
        <p className="form-message error">{errorMessage}</p>
        <button type="button" className="secondary-button" onClick={onBackToList}>
          목록으로
        </button>
      </section>
    );
  }

  if (!post) {
    return (
      <section className="page-section">
        <p className="empty-text">게시글을 선택해 주세요.</p>
      </section>
    );
  }

  const isAuthor = currentUser?.id === post.author.id;

  return (
    <article className="post-detail">
      <div className="detail-actions">
        <button type="button" className="secondary-button" onClick={onBackToList}>
          목록으로
        </button>
        <button type="button" className="text-button" onClick={onBackHome}>
          홈으로
        </button>

        {isAuthor && (
          <>
            <button
              type="button"
              className="text-button"
              onClick={() => onEditPost(post.id)}
            >
              수정
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              삭제
            </button>
          </>
        )}
      </div>

      {deleteErrorMessage && (
        <p className="form-message error">{deleteErrorMessage}</p>
      )}

      <header className="detail-header">
        <p className="eyebrow">{post.board.name}</p>
        <h2>{post.title}</h2>
        <dl className="detail-meta">
          <div>
            <dt>작성자</dt>
            <dd>{post.author.nickname}</dd>
          </div>
          <div>
            <dt>조회</dt>
            <dd>{post.view_count}</dd>
          </div>
          <div>
            <dt>댓글</dt>
            <dd>{post.comment_count}</dd>
          </div>
          <div>
            <dt>게시일</dt>
            <dd>{formatDate(post.published_at)}</dd>
          </div>
        </dl>
      </header>

      {post.figure_info && (
        <section className="detail-box" aria-labelledby="figure-info-title">
          <h3 id="figure-info-title">피규어 정보</h3>
          <dl className="figure-info-grid">
            <div>
              <dt>피규어명</dt>
              <dd>{post.figure_info.figure_name}</dd>
            </div>
            <div>
              <dt>제조사</dt>
              <dd>{post.figure_info.manufacturer || "-"}</dd>
            </div>
            <div>
              <dt>가격대</dt>
              <dd>{post.figure_info.price_range || "-"}</dd>
            </div>
            <div>
              <dt>만족도</dt>
              <dd>{post.figure_info.satisfaction_score || "-"}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="detail-content">
        {post.content.split("\n").map((line, index) => (
          <p key={`${line}-${index}`}>{line}</p>
        ))}
      </section>

      {post.tags.length > 0 && (
        <div className="tag-row" aria-label="tags">
          {post.tags.map((tag) => (
            <span key={tag.id}>{tag.name}</span>
          ))}
        </div>
      )}

      {post.images.length > 0 && (
        <section className="image-grid" aria-label="post images">
          {post.images.map((image) => (
            <img
              key={image.id}
              src={resolveMediaUrl(image.thumbnail_url || image.file_url)}
              alt=""
            />
          ))}
        </section>
      )}

      <section className="comments-section" aria-labelledby="comments-title">
        <div className="comments-heading">
          <div>
            <p className="eyebrow">Comments</p>
            <h3 id="comments-title">댓글 {post.comment_count}</h3>
          </div>
        </div>

        <CommentForm
          currentUser={currentUser}
          isSubmitting={comments.isSubmitting}
          onSubmit={handleCreateComment}
        />

        {comments.actionErrorMessage && (
          <p className="form-message error">{comments.actionErrorMessage}</p>
        )}

        <CommentList
          comments={comments.comments}
          currentUser={currentUser}
          data={comments.data}
          errorMessage={comments.errorMessage}
          isLoading={comments.isLoading}
          isSubmitting={comments.isSubmitting}
          onDelete={handleDeleteComment}
          onPageChange={comments.setPage}
          onUpdate={handleUpdateComment}
          page={comments.page}
        />
      </section>
    </article>
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


function resolveMediaUrl(url) {
  if (!url || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${apiOrigin}${url}`;
}


export default PostDetailPage;
