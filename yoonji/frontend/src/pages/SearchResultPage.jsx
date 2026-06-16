import { useEffect, useState } from "react";

import { getBoards } from "../api/boardApi";
import { searchPosts } from "../api/searchApi";
import PostList from "../components/post/PostList";
import { getApiErrorMessage } from "../hooks/usePosts";
import { PRICE_RANGE_FILTER_OPTIONS } from "../utils/priceRange";


const PAGE_SIZE = 10;

const SORT_OPTIONS = [
  { value: "latest", label: "최신순" },
  { value: "relevance", label: "관련도순" },
  { value: "views", label: "조회수순" },
  { value: "satisfaction", label: "만족도순" },
  { value: "comments", label: "댓글순" },
];

const EMPTY_FILTERS = {
  q: "",
  board_code: "",
  tag: "",
  figure_name: "",
  manufacturer: "",
  price_range: "",
  sort: "latest",
};


function SearchResultPage({ onBackHome, onOpenPost }) {
  const [boards, setBoards] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [boardErrorMessage, setBoardErrorMessage] = useState("");

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
    let ignore = false;

    async function loadSearchResults() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await searchPosts({
          ...compactParams(appliedFilters),
          page,
          size: PAGE_SIZE,
        });

        if (!ignore) {
          setData(response);
        }
      } catch (error) {
        if (!ignore) {
          setData(null);
          setErrorMessage(getApiErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadSearchResults();

    return () => {
      ignore = true;
    };
  }, [appliedFilters, page]);

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setAppliedFilters(filters);
    setPage(1);
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  }

  return (
    <div className="page-stack">
      <section className="page-section" aria-labelledby="search-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Search</p>
            <h2 id="search-title">게시글 검색</h2>
          </div>
          <button type="button" className="text-button" onClick={onBackHome}>
            홈으로
          </button>
        </div>

        <form className="search-panel" onSubmit={handleSubmit}>
          <label>
            검색어
            <input
              type="search"
              name="q"
              value={filters.q}
              onChange={handleFilterChange}
              placeholder="제목, 본문, 태그, 피규어명"
            />
          </label>

          <label>
            게시판
            <select
              name="board_code"
              value={filters.board_code}
              onChange={handleFilterChange}
            >
              <option value="">전체 게시판</option>
              {boards.map((board) => (
                <option key={board.id} value={board.code}>
                  {board.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            태그
            <input
              type="text"
              name="tag"
              value={filters.tag}
              onChange={handleFilterChange}
              placeholder="태그명"
            />
          </label>

          <label>
            피규어명
            <input
              type="text"
              name="figure_name"
              value={filters.figure_name}
              onChange={handleFilterChange}
              placeholder="예: 미쿠"
            />
          </label>

          <label>
            제조사
            <input
              type="text"
              name="manufacturer"
              value={filters.manufacturer}
              onChange={handleFilterChange}
              placeholder="예: Good Smile Company"
            />
          </label>

          <label>
            가격대
            <select
              name="price_range"
              value={filters.price_range}
              onChange={handleFilterChange}
            >
              {PRICE_RANGE_FILTER_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            정렬
            <select name="sort" value={filters.sort} onChange={handleFilterChange}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="search-actions">
            <button type="submit">검색</button>
            <button type="button" className="secondary-button" onClick={handleReset}>
              초기화
            </button>
          </div>
        </form>

        {boardErrorMessage && (
          <p className="form-message error">{boardErrorMessage}</p>
        )}
      </section>

      <section className="page-section" aria-labelledby="search-results-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Results</p>
            <h2 id="search-results-title">검색 결과</h2>
          </div>
          {data && <span className="result-count">총 {data.total}개</span>}
        </div>

        <PostList
          errorMessage={errorMessage}
          isLoading={isLoading}
          posts={data?.items || []}
          onSelectPost={onOpenPost}
        />

        {data && (
          <div className="pagination-bar" aria-label="search pagination">
            <button
              type="button"
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
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


function compactParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => String(value).trim() !== ""),
  );
}


export default SearchResultPage;
