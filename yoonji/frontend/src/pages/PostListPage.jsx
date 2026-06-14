import { useEffect, useState } from "react";

import { getBoards } from "../api/boardApi";
import { getTags } from "../api/tagApi";
import PostList from "../components/post/PostList";
import { getApiErrorMessage, usePostList } from "../hooks/usePosts";


const PAGE_SIZE = 10;


function PostListPage({
  initialBoardCode = "",
  isAuthenticated = false,
  onBackHome,
  onOpenPost,
  onOpenWrite,
}) {
  const [boards, setBoards] = useState([]);
  const [boardCode, setBoardCode] = useState(initialBoardCode);
  const [sort, setSort] = useState("latest");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearchQuery, setAppliedSearchQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [page, setPage] = useState(1);
  const [boardErrorMessage, setBoardErrorMessage] = useState("");
  const [tagErrorMessage, setTagErrorMessage] = useState("");
  const posts = usePostList({
    boardCode,
    page,
    q: appliedSearchQuery,
    size: PAGE_SIZE,
    sort,
    tag: tagFilter,
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

  useEffect(() => {
    const trimmed = tagQuery.trim();

    if (!trimmed) {
      setTagSuggestions([]);
      return;
    }

    let ignore = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await getTags({ q: trimmed, limit: 8 });

        if (!ignore) {
          setTagSuggestions(response.items);
          setTagErrorMessage("");
        }
      } catch (error) {
        if (!ignore) {
          setTagSuggestions([]);
          setTagErrorMessage(getApiErrorMessage(error));
        }
      }
    }, 180);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [tagQuery]);

  function handleSortChange(event) {
    setSort(event.target.value);
    setPage(1);
  }

  function handleBoardChange(event) {
    setBoardCode(event.target.value);
    setPage(1);
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    setAppliedSearchQuery(searchQuery.trim());
    setPage(1);
  }

  function clearSearchQuery() {
    setSearchQuery("");
    setAppliedSearchQuery("");
    setPage(1);
  }

  function applyTagFilter(tagName = tagQuery) {
    const trimmed = tagName.trim();
    setTagFilter(trimmed);
    setTagQuery(trimmed);
    setTagSuggestions([]);
    setPage(1);
  }

  function clearTagFilter() {
    setTagFilter("");
    setTagQuery("");
    setTagSuggestions([]);
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
          <div className="heading-actions">
            {isAuthenticated && (
              <button type="button" onClick={() => onOpenWrite(boardCode)}>
                글쓰기
              </button>
            )}
            <button type="button" className="text-button" onClick={onBackHome}>
              홈으로
            </button>
          </div>
        </div>

        <form className="list-toolbar" onSubmit={handleSearchSubmit}>
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
            검색어
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="제목, 본문, 피규어명"
            />
          </label>

          <div className="list-toolbar-actions">
            <button
              type="submit"
              className="secondary-button"
              disabled={!searchQuery.trim()}
            >
              검색
            </button>
            {appliedSearchQuery && (
              <button
                type="button"
                className="text-button"
                onClick={clearSearchQuery}
              >
                검색 초기화
              </button>
            )}
          </div>

          <div className="tag-filter-field">
            <label>
              태그
              <input
                type="text"
                value={tagQuery}
                onChange={(event) => setTagQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyTagFilter();
                  }
                }}
                placeholder="태그 검색"
              />
            </label>

            {tagSuggestions.length > 0 && (
              <div
                className="tag-suggestion-list compact"
                aria-label="tag filter suggestions"
              >
                {tagSuggestions.map((tag) => (
                  <button
                    key={`${tag.id}-${tag.tag_type}`}
                    type="button"
                    className="tag-suggestion"
                    onClick={() => applyTagFilter(tag.name)}
                  >
                    <span>{tag.name}</span>
                    <small>{tag.tag_type}</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="list-toolbar-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => applyTagFilter()}
              disabled={!tagQuery.trim()}
            >
              태그 적용
            </button>
            {tagFilter && (
              <button type="button" className="text-button" onClick={clearTagFilter}>
                태그 해제
              </button>
            )}
          </div>

          <label>
            정렬
            <select value={sort} onChange={handleSortChange}>
              <option value="latest">최신순</option>
              <option value="views">조회수순</option>
              <option value="satisfaction">만족도순</option>
              <option value="comments">댓글순</option>
            </select>
          </label>
        </form>

        {boardErrorMessage && (
          <p className="form-message error">{boardErrorMessage}</p>
        )}
        {tagErrorMessage && (
          <p className="form-message error">{tagErrorMessage}</p>
        )}
        {tagFilter && <p className="empty-text">선택한 태그: {tagFilter}</p>}

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
              {posts.data.page}페이지 / 총 {posts.data.total}개
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
