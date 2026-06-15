import { useEffect, useMemo, useState } from "react";

import { getProductEnrichment, requestProductEnrichment } from "../../api/productEnrichmentApi";
import { getApiErrorMessage } from "../../hooks/usePosts";
import Button from "../common/Button";


const WORKING_STATUSES = new Set(["REQUESTED", "PROCESSING"]);


function ProductInfoCard({ currentUser, postId }) {
  const [enrichment, setEnrichment] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(postId));
  const [isRequesting, setIsRequesting] = useState(false);

  const isWorking = WORKING_STATUSES.has(enrichment?.status);
  const canRequest = Boolean(currentUser) && !isLoading && !isRequesting && !isWorking;
  const matchedProduct = enrichment?.matched_product_json;
  const candidates = enrichment?.candidates_json || [];

  useEffect(() => {
    let ignore = false;

    async function loadEnrichment() {
      if (!postId) {
        setEnrichment(null);
        setIsLoading(false);
        setErrorMessage("");
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await getProductEnrichment(postId);

        if (!ignore) {
          setEnrichment(response);
        }
      } catch (error) {
        if (!ignore) {
          setEnrichment(null);
          setErrorMessage(getApiErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadEnrichment();

    return () => {
      ignore = true;
    };
  }, [postId]);

  useEffect(() => {
    if (!postId || !isWorking) {
      return undefined;
    }

    let ignore = false;
    const timerId = window.setTimeout(async () => {
      try {
        const response = await getProductEnrichment(postId);

        if (!ignore) {
          setEnrichment(response);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(getApiErrorMessage(error));
        }
      }
    }, 2500);

    return () => {
      ignore = true;
      window.clearTimeout(timerId);
    };
  }, [isWorking, postId]);

  async function handleRequestEnrichment() {
    setIsRequesting(true);
    setErrorMessage("");

    try {
      const response = await requestProductEnrichment(postId);
      setEnrichment(response);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsRequesting(false);
    }
  }

  const headingText = useMemo(() => {
    if (enrichment?.match_status === "VERIFIED") {
      return "Official Product";
    }

    return "Official Product Check";
  }, [enrichment]);

  return (
    <section className="product-info-section" aria-labelledby="product-info-title">
      <div className="product-info-heading">
        <div>
          <p className="eyebrow">Good Smile SmartStore</p>
          <h3 id="product-info-title">{headingText}</h3>
        </div>
        <Button
          disabled={!canRequest}
          isLoading={isRequesting || isWorking}
          onClick={handleRequestEnrichment}
        >
          조회
        </Button>
      </div>

      {!currentUser && !enrichment && (
        <p className="empty-text">로그인하면 공식 판매 정보를 조회할 수 있습니다.</p>
      )}

      {isLoading && <p className="empty-text">공식 판매 정보를 확인하는 중입니다.</p>}

      {errorMessage && <p className="form-message error">{errorMessage}</p>}

      {isWorking && (
        <p className="empty-text">공식 스마트스토어 후보를 확인하는 중입니다.</p>
      )}

      {enrichment?.match_status === "VERIFIED" && matchedProduct && (
        <OfficialProductCard product={matchedProduct} />
      )}

      {enrichment?.match_status === "CANDIDATES_ONLY" && (
        <CandidateOnlyPanel candidates={candidates} />
      )}

      {enrichment?.match_status === "NO_MATCH" && enrichment.status === "COMPLETED" && (
        <p className="empty-text">공식 상품 정보를 찾지 못했습니다.</p>
      )}

      {enrichment?.status === "FAILED" && (
        <p className="form-message error">
          {enrichment.error_message || "외부 상품 정보 조회에 실패했습니다."}
        </p>
      )}
    </section>
  );
}


function OfficialProductCard({ product }) {
  const title = product.metadata?.title || product.title || product.normalized_title;
  const image = product.metadata?.image || product.image;
  const price = product.metadata?.price || product.lprice || product.hprice;
  const url = product.metadata?.final_url || product.link || product.metadata?.product_url;

  return (
    <article className="official-product-card">
      {image && <img src={image} alt="" />}
      <div>
        <p className="product-status-pill">VERIFIED</p>
        <h4>{title}</h4>
        <dl>
          <div>
            <dt>가격</dt>
            <dd>{formatPrice(price)}</dd>
          </div>
          <div>
            <dt>브랜드</dt>
            <dd>{product.brand || product.maker || "-"}</dd>
          </div>
          <div>
            <dt>매칭</dt>
            <dd>{formatScore(product.match_score)}</dd>
          </div>
        </dl>
        {url && (
          <a href={url} target="_blank" rel="noreferrer">
            공식 스토어 보기
          </a>
        )}
      </div>
    </article>
  );
}


function CandidateOnlyPanel({ candidates }) {
  return (
    <div className="product-candidate-panel">
      <p className="form-message">
        정확한 공식 상품을 확정할 수 없습니다.
      </p>
      {candidates.length > 0 && (
        <div className="product-candidate-list">
          {candidates.slice(0, 3).map((candidate) => (
            <a
              key={candidate.link || candidate.product_id || candidate.title}
              href={candidate.link}
              target="_blank"
              rel="noreferrer"
            >
              <span>{formatScore(candidate.match_score)}</span>
              {candidate.title || candidate.normalized_title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}


function formatPrice(value) {
  if (!value) {
    return "-";
  }

  return `${Number(value).toLocaleString("ko-KR")}원`;
}


function formatScore(value) {
  if (typeof value !== "number") {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}


export default ProductInfoCard;
