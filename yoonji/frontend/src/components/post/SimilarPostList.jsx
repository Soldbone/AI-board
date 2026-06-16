import { useEffect, useState } from "react";

import { API_BASE_URL } from "../../api/client";
import { getSimilarPosts } from "../../api/postApi";
import { getApiErrorMessage } from "../../hooks/usePosts";
import { formatPriceRange } from "../../utils/priceRange";


function SimilarPostList({ onSelectPost, postId }) {
  const [data, setData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(postId));

  useEffect(() => {
    let ignore = false;

    async function loadSimilarPosts() {
      if (!postId) {
        setData(null);
        setIsLoading(false);
        setErrorMessage("");
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await getSimilarPosts(postId, 3);

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

    loadSimilarPosts();

    return () => {
      ignore = true;
    };
  }, [postId]);

  const items = data?.items || [];

  return (
    <section
      className="similar-posts-section similar-review-section"
      aria-labelledby="similar-posts-title"
    >
      <div className="similar-posts-heading">
        <div>
          <h3 id="similar-posts-title">비슷한 후기글</h3>
        </div>
      </div>

      {isLoading && <p className="empty-text">Loading similar reviews.</p>}

      {errorMessage && <p className="form-message error">{errorMessage}</p>}

      {!isLoading && !errorMessage && items.length === 0 && (
        <p className="empty-text">No similar reviews are indexed yet.</p>
      )}

      {items.length > 0 && (
        <div className="similar-post-grid">
          {items.map((item) => (
            <button
              key={item.post.id}
              type="button"
              className="similar-post-card"
              onClick={() => onSelectPost(item.post.id)}
            >
              {item.post.thumbnail_url && (
                <img
                  src={resolveMediaUrl(item.post.thumbnail_url)}
                  alt=""
                />
              )}
              <div>
                <span>{Math.round(item.score * 100)}% match</span>
                <h4>{item.post.title}</h4>
                <p>{item.reason || "similar indexed review"}</p>
                <dl>
                  <div>
                    <dt>Price</dt>
                    <dd>{formatPriceRange(item.post.price_range)}</dd>
                  </div>
                  <div>
                    <dt>Score</dt>
                    <dd>{item.post.satisfaction_score || "-"}</dd>
                  </div>
                </dl>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}


function resolveMediaUrl(url) {
  if (!url || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${apiOrigin}${url}`;
}


export default SimilarPostList;
