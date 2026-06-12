function PostCard({ post, onSelectPost }) {
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
