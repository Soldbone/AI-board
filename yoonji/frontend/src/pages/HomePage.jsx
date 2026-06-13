import { useEffect, useState } from "react";

import { getBoards } from "../api/boardApi";
import PostList from "../components/post/PostList";
import { getApiErrorMessage, usePostList } from "../hooks/usePosts";


function HomePage({ onOpenBoard, onOpenPost }) {
  const [boards, setBoards] = useState([]);
  const [boardErrorMessage, setBoardErrorMessage] = useState("");
  const [isBoardLoading, setIsBoardLoading] = useState(true);
  const latestPosts = usePostList({ page: 1, size: 5, sort: "latest" });

  useEffect(() => {
    let ignore = false;

    async function loadBoards() {
      setIsBoardLoading(true);
      setBoardErrorMessage("");

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
      } finally {
        if (!ignore) {
          setIsBoardLoading(false);
        }
      }
    }

    loadBoards();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="page-stack home-stack">
      <section className="page-section home-board-section" aria-labelledby="boards-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Boards</p>
            <h2 id="boards-title">게시판</h2>
          </div>
        </div>

        {isBoardLoading && (
          <p className="empty-text">게시판을 불러오는 중입니다.</p>
        )}
        {boardErrorMessage && (
          <p className="form-message error">{boardErrorMessage}</p>
        )}

        <div className="board-grid">
          {boards.map((board) => (
            <button
              key={board.id}
              type="button"
              className="board-tile"
              onClick={() => onOpenBoard(board.code)}
            >
              <span>{board.name}</span>
              <small>{board.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="page-section home-latest-section" aria-labelledby="latest-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Latest</p>
            <h2 id="latest-title">최신 게시글</h2>
          </div>
          <button type="button" className="text-button" onClick={() => onOpenBoard("")}>
            전체 보기
          </button>
        </div>

        <PostList
          errorMessage={latestPosts.errorMessage}
          isLoading={latestPosts.isLoading}
          posts={latestPosts.posts}
          onSelectPost={onOpenPost}
        />
      </section>
    </div>
  );
}


export default HomePage;
