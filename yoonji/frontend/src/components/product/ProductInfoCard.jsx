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
  const candidates = useMemo(() => {
    if (Array.isArray(enrichment?.candidates_json) && enrichment.candidates_json.length > 0) {
      return enrichment.candidates_json;
    }

    if (enrichment?.matched_product_json) {
      return [enrichment.matched_product_json];
    }

    return [];
  }, [enrichment]);

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

  return (
    <section className="product-info-section" aria-labelledby="product-info-title">
      <div className="product-info-heading">
        <div>
          <p className="eyebrow">Naver Shopping</p>
          <h3 id="product-info-title">상품 후보</h3>
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
        <p className="empty-text">로그인하면 네이버 쇼핑 상품 후보를 조회할 수 있습니다.</p>
      )}

      {isLoading && <p className="empty-text">저장된 상품 후보를 확인하는 중입니다.</p>}

      {errorMessage && <p className="form-message error">{errorMessage}</p>}

      {isWorking && (
        <p className="empty-text">네이버 쇼핑에서 상품 후보를 찾는 중입니다.</p>
      )}

      {enrichment?.status === "COMPLETED" && candidates.length > 0 && (
        <CandidatePanel candidates={candidates} queryText={enrichment.query_text} />
      )}

      {enrichment?.status === "COMPLETED" && candidates.length === 0 && (
        <p className="empty-text">네이버 쇼핑에서 표시할 상품 후보를 찾지 못했습니다.</p>
      )}

      {enrichment?.status === "FAILED" && (
        <p className="form-message error">
          {enrichment.error_message || "네이버 쇼핑 상품 후보 조회에 실패했습니다."}
        </p>
      )}
    </section>
  );
}


function CandidatePanel({ candidates, queryText }) {
  return (
    <div className="product-candidate-panel">
      <p className="form-message">
        네이버 쇼핑 검색 결과입니다. 공식 판매처로 검증된 정보는 아니므로 상품명과 판매처를 확인해 주세요.
      </p>
      {queryText && <p className="product-search-query">검색어: {queryText}</p>}
      <div className="product-candidate-list">
        {candidates.slice(0, 3).map((candidate) => (
          <CandidateCard
            candidate={candidate}
            key={candidate.link || candidate.product_id || candidate.title}
          />
        ))}
      </div>
    </div>
  );
}


function CandidateCard({ candidate }) {
  const title = candidate.title || candidate.normalized_title || "상품명 없음";
  const image = candidate.image || candidate.metadata?.image;
  const price = candidate.lprice || candidate.metadata?.price || candidate.hprice;
  const url = candidate.link || candidate.metadata?.final_url || candidate.metadata?.product_url;
  const mallName = candidate.mall_name || "-";

  return (
    <article className="shopping-product-card">
      {image && <img src={image} alt="" />}
      <div className="shopping-product-body">
        <p className="product-status-pill">검색 후보</p>
        <h4>{title}</h4>
        <dl>
          <div>
            <dt>가격</dt>
            <dd>{formatPrice(price)}</dd>
          </div>
          <div>
            <dt>쇼핑몰</dt>
            <dd>{mallName}</dd>
          </div>
        </dl>
        {url && (
          <a href={url} target="_blank" rel="noreferrer">
            네이버 쇼핑에서 보기
          </a>
        )}
      </div>
    </article>
  );
}


function formatPrice(value) {
  if (!value) {
    return "-";
  }

  return `${Number(value).toLocaleString("ko-KR")}원`;
}


export default ProductInfoCard;
