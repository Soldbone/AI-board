import { resolveMediaUrl } from "../../utils/mediaUrl";


function PostCard({ post, onSelectPost, variant = "list" }) {
  if (variant === "review-grid") {
    const visibleTags = post.tags.slice(0, 4);
    const hiddenTagCount = Math.max(post.tags.length - visibleTags.length, 0);
    const thumbnailUrl = resolveMediaUrl(post.thumbnail_url);

    return (
      <article className="post-card review-preview-card">
        <button
          type="button"
          className="post-card-button"
          onClick={() => onSelectPost(post.id)}
        >
          <div className="review-preview-image">
            {thumbnailUrl ? (
              <>
                <img
                  className="review-preview-image-bg"
                  src={thumbnailUrl}
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="review-preview-image-main"
                  src={thumbnailUrl}
                  alt=""
                />
              </>
            ) : (
              <span>이미지 없음</span>
            )}
          </div>

          <div className="review-preview-body">
            <div className="post-card-topline">
              <span>조회수 {post.view_count}</span>
              <span>댓글 {post.comment_count}</span>
              <span>작성자 {post.author.nickname}</span>
            </div>

            <h3>{post.title}</h3>

            {post.tags.length > 0 && (
              <div className="post-card-tags" aria-label="post tags">
                {visibleTags.map((tag) => (
                  <span key={tag.id}>{tag.name}</span>
                ))}
                {hiddenTagCount > 0 && <span>+{hiddenTagCount}</span>}
              </div>
            )}
          </div>
        </button>
      </article>
    );
  }

  return (
    <article className="post-card">
      <button
        type="button"
        className="post-card-button"
        onClick={() => onSelectPost(post.id)}
      >
        <div className="post-card-topline">
          <span>{post.board.name}</span>
          <span>조회 {post.view_count}</span>
        </div>

        <h3>{post.title}</h3>
        <p>{post.summary}</p>

        {post.tags.length > 0 && (
          <div className="post-card-tags" aria-label="post tags">
            {post.tags.map((tag) => (
              <span key={tag.id}>{tag.name}</span>
            ))}
          </div>
        )}

        <div className="post-card-meta">
          <span>{post.author.nickname}</span>
          <span>댓글 {post.comment_count}</span>
          {post.figure_info?.satisfaction_score && (
            <span>만족도 {post.figure_info.satisfaction_score}/5</span>
          )}
        </div>
      </button>
    </article>
  );
}


export default PostCard;
