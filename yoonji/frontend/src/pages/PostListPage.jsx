import { useEffect, useState } from "react";

import { getBoards } from "../api/boardApi";
import PostList from "../components/post/PostList";
import { getApiErrorMessage, usePostList } from "../hooks/usePosts";


const PAGE_SIZE = 10;


function PostListPage({ initialBoardCode = "", onBackHome, onOpenPost }) {
  const [boards, setBoards] = useState([]);
  const [boardCode, setBoardCode] = useState(initialBoardCode);
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(1);
  const [boardErrorMessage, setBoardErrorMessage] = useState("");
  const posts = usePostList({
    boardCode,
    page,
    size: PAGE_SIZE,
    sort,
  });

  useEffect(() => {
    setBoardCode(initialBoardCode);
    setPage(1);
  }, [initialBoardCode]);

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

  function handleBoardChange(event) {
    setBoardCode(event.target.value);
    setPage(1);
  }

  function handleSortChange(event) {
    setSort(event.target.value);
    setPage(1);
  }

  const selectedBoard = boards.find((board) => board.code === boardCode);

  return (
    <div className="page-stack">
      <section className="page-section" aria-labelledby="post-list-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Posts</p>
            <h2 id="post-list-title">
              {selectedBoard ? selectedBoard.name : "전체 게시글"}
            </h2>
          </div>
          <button type="button" className="text-button" onClick={onBackHome}>
            홈으로
          </button>
        </div>

        <div className="list-toolbar">
          <label>
            게시판
            <select value={boardCode} onChange={handleBoardChange}>
              <option value="">전체</option>
              {boards.map((board) => (
                <option key={board.id} value={board.code}>
                  {board.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            정렬
            <select value={sort} onChange={handleSortChange}>
              <option value="latest">최신순</option>
              <option value="views">조회수순</option>
            </select>
          </label>
        </div>

        {boardErrorMessage && (
          <p className="form-message error">{boardErrorMessage}</p>
        )}

        <PostList
          errorMessage={posts.errorMessage}
          isLoading={posts.isLoading}
          posts={posts.posts}
          onSelectPost={onOpenPost}
        />

        {posts.data && (
          <div className="pagination-bar" aria-label="pagination">
            <button
              type="button"
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              이전
            </button>
            <span>
              {posts.data.page} / 총 {posts.data.total}개
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={!posts.data.has_next}
              onClick={() => setPage((current) => current + 1)}
            >
              다음
            </button>
          </div>
        )}
      </section>
    </div>
  );
}


export default PostListPage;
