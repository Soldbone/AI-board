function AiSourceList({ onSelectPost, sources = [] }) {
  if (sources.length === 0) {
    return null;
  }

  const sortedSources = [...sources].sort(
    (left, right) => left.rank_order - right.rank_order,
  );

  return (
    <div className="ai-source-list">
      <h4>Sources</h4>
      <ol>
        {sortedSources.map((source) => (
          <li key={source.id}>
            <div className="ai-source-meta">
              <span>#{source.rank_order}</span>
              {typeof source.relevance_score === "number" && (
                <span>{Math.round(source.relevance_score * 100)}% match</span>
              )}
              {source.source_post_id && (
                <button
                  type="button"
                  className="ai-source-link"
                  onClick={() => onSelectPost?.(source.source_post_id)}
                >
                  Post {source.source_post_id}
                </button>
              )}
              {source.source_comment_id && (
                <span>Comment {source.source_comment_id}</span>
              )}
            </div>
            <p>{source.excerpt}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}


export default AiSourceList;
