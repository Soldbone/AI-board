import { useEffect, useState } from "react";

import "./App.css";
import { API_BASE_URL, healthCheck } from "./api/client";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";


const STATUS_LABEL = {
  loading: "loading",
  connected: "connected",
  failed: "failed",
};


function App() {
  const [connectionStatus, setConnectionStatus] = useState("loading");
  const [healthResponse, setHealthResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const auth = useAuth();

  useEffect(() => {
    let ignore = false;

    async function checkBackendConnection() {
      try {
        const data = await healthCheck();

        if (!ignore) {
          setHealthResponse(data);
          setConnectionStatus("connected");
        }
      } catch (error) {
        if (!ignore) {
          setConnectionStatus("failed");
          setErrorMessage(error.message);
        }
      }
    }

    checkBackendConnection();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="app-header" aria-labelledby="app-title">
        <div className="phase-label">Phase 3</div>
        <h1 id="app-title">Figure Community</h1>
        <p className="subtitle">회원가입 / 로그인 / JWT 인증</p>
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
                {STATUS_LABEL[connectionStatus]}
              </span>
            </dd>
          </div>
          <div>
            <dt>Auth status</dt>
            <dd>
              <span className={`status-pill ${auth.status}`}>
                {auth.status}
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
            Backend connection failed: {errorMessage}
          </p>
        )}
      </section>

      <section className="auth-grid" aria-label="auth forms">
        <SignupPage onSignup={auth.signup} />
        <LoginPage onLogin={auth.login} />
      </section>

      <section className="account-panel" aria-labelledby="account-title">
        <h2 id="account-title">내 정보</h2>

        {auth.user ? (
          <>
            <dl className="account-list">
              <div>
                <dt>ID</dt>
                <dd>{auth.user.id}</dd>
              </div>
              <div>
                <dt>로그인 ID</dt>
                <dd>{auth.user.login_id}</dd>
              </div>
              <div>
                <dt>닉네임</dt>
                <dd>{auth.user.nickname}</dd>
              </div>
              <div>
                <dt>권한</dt>
                <dd>{auth.user.role}</dd>
              </div>
            </dl>

            <div className="account-actions">
              <button type="button" onClick={auth.loadMe}>
                내 정보 조회
              </button>
              <button type="button" className="secondary-button" onClick={auth.logout}>
                로그아웃
              </button>
            </div>
          </>
        ) : (
          <p className="empty-text">로그인 상태가 아닙니다.</p>
        )}

        {auth.errorMessage && (
          <p className="form-message error">{auth.errorMessage}</p>
        )}
      </section>
    </main>
  );
}


export default App;
