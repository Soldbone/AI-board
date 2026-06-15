import { useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "../../api/client";
import { getPosts } from "../../api/postApi";
import { getApiErrorMessage } from "../../hooks/usePosts";


const MAX_REFERENCE_REVIEWS = 4;
const MAX_SEARCH_TERMS = 6;
const STOP_WORDS = new Set([
  "구매",
  "고민",
  "가격",
  "정도",
  "피규어",
  "후기",
  "리뷰",
  "추천",
  "살까",
  "살까요",
  "사도",
  "괜찮",
  "괜찮을까요",
  "어떤",
  "이거",
  "너무",
  "혹시",
  "궁금",
  "합니다",
]);


function ReferenceReviewList({ onSelectPost, post }) {
  const searchTerms = useMemo(() => buildReviewSearchTerms(post), [post]);
  const [items, setItems] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(post));

  useEffect(() => {
    let ignore = false;

    async function loadReferenceReviews() {
      if (!post) {
        setItems([]);
        setIsLoading(false);
        setErrorMessage("");
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      try {
        const searchResults = await loadReviewsByTerms(searchTerms);
        const rankedSearchItems = rankReviewItems({
          post,
          searchResults,
          searchTerms,
        });

        let items = rankedSearchItems;

        if (items.length < MAX_REFERENCE_REVIEWS) {
          const fallbackData = await getPosts({
            board_code: "REVIEW",
            page: 1,
            size: MAX_REFERENCE_REVIEWS,
            sort: "satisfaction",
          });
          items = mergeReviewItems(
            items,
            (fallbackData.items || []).map((review) => ({
              matchReason: "만족도 높은 후기",
              post: review,
              score: 0,
            })),
          );
        }

        if (!ignore) {
          setItems(items.slice(0, MAX_REFERENCE_REVIEWS));
        }
      } catch (error) {
        if (!ignore) {
          setItems([]);
          setErrorMessage(getApiErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadReferenceReviews();

    return () => {
      ignore = true;
    };
  }, [post, searchTerms]);

  return (
    <section className="similar-posts-section" aria-labelledby="reference-reviews-title">
      <div className="similar-posts-heading">
        <div>
          <p className="eyebrow">Review Board</p>
          <h3 id="reference-reviews-title">AI 추천 - 참고할 만한 후기글</h3>
        </div>
      </div>

      {isLoading && <p className="empty-text">후기글을 불러오는 중입니다.</p>}

      {errorMessage && <p className="form-message error">{errorMessage}</p>}

      {!isLoading && !errorMessage && items.length === 0 && (
        <p className="empty-text">아직 참고할 만한 후기글이 없습니다.</p>
      )}

      {!isLoading && !errorMessage && items.length > 0 && (
        <div className="similar-post-grid">
          {items.map((item) => (
            <ReferenceReviewCard
              key={item.post.id}
              item={item}
              onSelectPost={onSelectPost}
            />
          ))}
        </div>
      )}
    </section>
  );
}


function ReferenceReviewCard({ item, onSelectPost }) {
  const review = item.post;
  const figureInfo = review.figure_info;

  return (
    <button
      type="button"
      className="similar-post-card reference-review-card"
      onClick={() => onSelectPost(review.id)}
    >
      {review.thumbnail_url ? (
        <img src={resolveMediaUrl(review.thumbnail_url)} alt="" />
      ) : (
        <div className="reference-review-placeholder">REVIEW</div>
      )}

      <div>
        <span>{item.matchReason}</span>
        <h4>{review.title}</h4>
        <p>{review.summary}</p>

        {review.tags.length > 0 && (
          <div className="post-card-tags" aria-label="review tags">
            {review.tags.slice(0, 4).map((tag) => (
              <span key={tag.id}>{tag.name}</span>
            ))}
          </div>
        )}

        <dl>
          <div>
            <dt>가격대</dt>
            <dd>{figureInfo?.price_range || "-"}</dd>
          </div>
          <div>
            <dt>만족도</dt>
            <dd>{figureInfo?.satisfaction_score || "-"}</dd>
          </div>
          <div>
            <dt>댓글</dt>
            <dd>{review.comment_count}</dd>
          </div>
        </dl>
      </div>
    </button>
  );
}


async function loadReviewsByTerms(searchTerms) {
  if (searchTerms.length === 0) {
    return [];
  }

  return Promise.all(
    searchTerms.map(async (term) => {
      const response = await getPosts({
        board_code: "REVIEW",
        page: 1,
        q: term,
        size: MAX_REFERENCE_REVIEWS,
        sort: "relevance",
      });

      return {
        items: response.items || [],
        term,
      };
    }),
  );
}


function rankReviewItems({ post, searchResults, searchTerms }) {
  const tagNames = new Set((post.tags || []).map((tag) => normalizeText(tag.name)));
  const reviewMap = new Map();

  searchResults.forEach((result, termIndex) => {
    result.items.forEach((review) => {
      const existing = reviewMap.get(review.id) || {
        matchTerms: new Set(),
        post: review,
        score: 0,
      };
      const normalizedTerm = normalizeText(result.term);
      const reviewTags = (review.tags || []).map((tag) => normalizeText(tag.name));
      const hasMatchingTag = reviewTags.some((tagName) => tagNames.has(tagName));
      const satisfactionScore = review.figure_info?.satisfaction_score || 0;

      existing.matchTerms.add(result.term);
      existing.score += MAX_SEARCH_TERMS - termIndex;
      existing.score += hasMatchingTag ? 4 : 0;
      existing.score += normalizedTerm && titleContains(review, normalizedTerm) ? 3 : 0;
      existing.score += satisfactionScore / 2;

      reviewMap.set(review.id, existing);
    });
  });

  return Array.from(reviewMap.values())
    .sort((left, right) => right.score - left.score)
    .map((item) => ({
      ...item,
      matchReason: buildMatchReason(item.matchTerms, searchTerms),
    }));
}


function mergeReviewItems(primaryItems, fallbackItems) {
  const merged = [...primaryItems];
  const existingIds = new Set(primaryItems.map((item) => item.post.id));

  fallbackItems.forEach((item) => {
    if (!existingIds.has(item.post.id)) {
      existingIds.add(item.post.id);
      merged.push(item);
    }
  });

  return merged;
}


function buildReviewSearchTerms(post) {
  if (!post) {
    return [];
  }

  const terms = [];

  (post.tags || []).forEach((tag) => {
    addSearchTerm(terms, tag.name);
  });

  extractTokens(`${post.title} ${post.content}`).forEach((token) => {
    addSearchTerm(terms, token);
  });

  return terms.slice(0, MAX_SEARCH_TERMS);
}


function extractTokens(text) {
  return text.match(/[가-힣A-Za-z0-9]{2,}/g) || [];
}


function addSearchTerm(terms, value) {
  const term = normalizeSearchTerm(value);

  if (!term || terms.some((existingTerm) => normalizeText(existingTerm) === normalizeText(term))) {
    return;
  }

  terms.push(term);
}


function normalizeSearchTerm(value) {
  const term = String(value || "").trim().replace(/\s+/g, " ");
  const normalized = normalizeText(term);

  if (
    term.length < 2 ||
    term.length > 50 ||
    STOP_WORDS.has(normalized) ||
    /^\d+$/.test(term)
  ) {
    return "";
  }

  return term;
}


function buildMatchReason(matchTerms, searchTerms) {
  const orderedTerms = searchTerms.filter((term) => matchTerms.has(term));

  if (orderedTerms.length === 0) {
    return "후기 게시판 글";
  }

  return `${orderedTerms.slice(0, 2).join(", ")} 관련 후기`;
}


function titleContains(review, normalizedTerm) {
  return normalizeText(review.title).includes(normalizedTerm);
}


function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}


function resolveMediaUrl(url) {
  if (!url || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${apiOrigin}${url}`;
}


export default ReferenceReviewList;
