import { API_BASE_URL } from "../api/client";
import { usePostDetail } from "../hooks/usePosts";


function PostDetailPage({ onBackHome, onBackToList, postId }) {
  const { errorMessage, isLoading, post } = usePostDetail(postId);

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

  return (
    <article className="post-detail">
      <div className="detail-actions">
        <button type="button" className="secondary-button" onClick={onBackToList}>
          목록으로
        </button>
        <button type="button" className="text-button" onClick={onBackHome}>
          홈으로
        </button>
      </div>

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
