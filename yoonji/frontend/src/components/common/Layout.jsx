import { API_BASE_URL } from "../../api/client";
import Header from "./Header";


const STATUS_LABEL = {
  anonymous: "비로그인",
  authenticated: "로그인",
  connected: "연결됨",
  failed: "실패",
  loading: "확인 중",
};


function Layout({
  auth,
  children,
  connectionErrorMessage,
  connectionStatus,
  healthResponse,
}) {
  return (
    <div className="app-shell">
      <Header auth={auth} />

      <section className="app-hero" aria-labelledby="app-title">
        <p className="phase-label">Phase 10</p>
        <h1 id="app-title">Figure Community</h1>
        <p className="subtitle">
          게시판 탐색, 검색, 마이페이지 흐름을 React Router로 연결한 MVP입니다.
        </p>
      </section>

      <section className="status-strip" aria-label="connection status">
        <dl className="status-list">
          <div>
            <dt>API base URL</dt>
            <dd>{API_BASE_URL}</dd>
          </div>
          <div>
            <dt>Health check</dt>
            <dd>
              <span className={`status-pill ${connectionStatus}`}>
                {STATUS_LABEL[connectionStatus] || connectionStatus}
              </span>
            </dd>
          </div>
          <div>
            <dt>Auth status</dt>
            <dd>
              <span className={`status-pill ${auth.status}`}>
                {STATUS_LABEL[auth.status] || auth.status}
              </span>
            </dd>
          </div>
        </dl>

        {connectionStatus === "connected" && (
          <pre className="response-box">
            {JSON.stringify(healthResponse, null, 2)}
          </pre>
        )}

        {connectionStatus === "failed" && (
          <p className="form-message error">
            Backend connection failed: {connectionErrorMessage}
          </p>
        )}
      </section>

      <main className="layout-main" aria-label="page content">
        {children}
      </main>
    </div>
  );
}


export default Layout;
