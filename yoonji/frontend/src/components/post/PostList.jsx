import PostCard from "./PostCard";


function PostList({ boardCode = "", errorMessage, isLoading, onSelectPost, posts }) {
  if (isLoading) {
    return <p className="empty-text">게시글을 불러오는 중입니다.</p>;
  }

  if (errorMessage) {
    return <p className="form-message error">{errorMessage}</p>;
  }

  if (posts.length === 0) {
    return <p className="empty-text">아직 표시할 게시글이 없습니다.</p>;
  }

  const isReviewBoard = boardCode === "REVIEW";

  return (
    <div className={`post-list${isReviewBoard ? " review-card-grid" : ""}`}>
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onSelectPost={onSelectPost}
          variant={isReviewBoard ? "review-grid" : "list"}
        />
      ))}
    </div>
  );
}


export default PostList;
