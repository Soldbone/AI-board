import { useEffect, useState } from "react";

import { getMyComments, getMyPosts } from "../api/userApi";
import PostList from "../components/post/PostList";
import { getApiErrorMessage } from "../hooks/usePosts";


const PAGE_SIZE = 10;


function MyPage({ currentUser, isAuthenticated, onBackHome, onOpenPost }) {
  const [activeTab, setActiveTab] = useState("posts");
  const [postsPage, setPostsPage] = useState(1);
  const [commentsPage, setCommentsPage] = useState(1);
  const [postsData, setPostsData] = useState(null);
  const [commentsData, setCommentsData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isAuthenticated || activeTab !== "posts") {
      return;
    }

    let ignore = false;

    async function loadPosts() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await getMyPosts({
          page: postsPage,
          size: PAGE_SIZE,
        });

        if (!ignore) {
          setPostsData(response);
        }
      } catch (error) {
        if (!ignore) {
          setPostsData(null);
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
  }, [activeTab, isAuthenticated, postsPage]);

  useEffect(() => {
    if (!isAuthenticated || activeTab !== "comments") {
      return;
    }

    let ignore = false;

    async function loadComments() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await getMyComments({
          page: commentsPage,
          size: PAGE_SIZE,
        });

        if (!ignore) {
          setCommentsData(response);
        }
      } catch (error) {
        if (!ignore) {
          setCommentsData(null);
          setErrorMessage(getApiErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadComments();

    return () => {
      ignore = true;
    };
  }, [activeTab, commentsPage, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <section className="page-section" aria-labelledby="mypage-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">My Page</p>
            <h2 id="mypage-title">마이페이지</h2>
          </div>
          <button type="button" className="text-button" onClick={onBackHome}>
            홈으로
          </button>
        </div>
        <p className="empty-text">로그인하면 내가 작성한 글과 댓글을 볼 수 있습니다.</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-section" aria-labelledby="mypage-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">My Page</p>
            <h2 id="mypage-title">{currentUser?.nickname || "내 활동"}</h2>
          </div>
          <button type="button" className="text-button" onClick={onBackHome}>
            홈으로
          </button>
        </div>

        <div className="tab-row" role="tablist" aria-label="my activity">
          <button
            type="button"
            className={activeTab === "posts" ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab("posts")}
          >
            내 게시글
          </button>
          <button
            type="button"
            className={activeTab === "comments" ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab("comments")}
          >
            내 댓글
          </button>
        </div>
      </section>

      {activeTab === "posts" && (
        <section className="page-section" aria-labelledby="my-posts-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Posts</p>
              <h2 id="my-posts-title">내가 쓴 게시글</h2>
            </div>
            {postsData && <span className="result-count">총 {postsData.total}개</span>}
          </div>

          <PostList
            errorMessage={errorMessage}
            isLoading={isLoading}
            posts={postsData?.items || []}
            onSelectPost={onOpenPost}
          />

          {postsData && (
            <Pagination
              data={postsData}
              page={postsPage}
              onPageChange={setPostsPage}
            />
          )}
        </section>
      )}

      {activeTab === "comments" && (
        <section className="page-section" aria-labelledby="my-comments-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Comments</p>
              <h2 id="my-comments-title">내가 쓴 댓글</h2>
            </div>
            {commentsData && (
              <span className="result-count">총 {commentsData.total}개</span>
            )}
          </div>

          <CommentActivityList
            comments={commentsData?.items || []}
            errorMessage={errorMessage}
            isLoading={isLoading}
            onOpenPost={onOpenPost}
          />

          {commentsData && (
            <Pagination
              data={commentsData}
              page={commentsPage}
              onPageChange={setCommentsPage}
            />
          )}
        </section>
      )}
    </div>
  );
}


function CommentActivityList({ comments, errorMessage, isLoading, onOpenPost }) {
  if (isLoading) {
    return <p className="empty-text">댓글을 불러오는 중입니다.</p>;
  }

  if (errorMessage) {
    return <p className="form-message error">{errorMessage}</p>;
  }

  if (comments.length === 0) {
    return <p className="empty-text">아직 작성한 댓글이 없습니다.</p>;
  }

  return (
    <div className="activity-list">
      {comments.map((comment) => (
        <article key={comment.id} className="activity-card">
          <button
            type="button"
            className="activity-title-button"
            onClick={() => onOpenPost(comment.post_id)}
          >
            {comment.post_title}
          </button>
          <p>{comment.content}</p>
          <div className="post-card-meta">
            <span>댓글 ID {comment.id}</span>
            <span>{formatDateTime(comment.created_at)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}


function Pagination({ data, page, onPageChange }) {
  return (
    <div className="pagination-bar" aria-label="my page pagination">
      <button
        type="button"
        className="secondary-button"
        disabled={page <= 1}
        onClick={() => onPageChange((current) => current - 1)}
      >
        이전
      </button>
      <span>
        {data.page}페이지 / 총 {data.total}개
      </span>
      <button
        type="button"
        className="secondary-button"
        disabled={!data.has_next}
        onClick={() => onPageChange((current) => current + 1)}
      >
        다음
      </button>
    </div>
  );
}


function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}


export default MyPage;
