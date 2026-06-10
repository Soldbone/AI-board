import { useEffect, useState } from "react";

import "./App.css";
import { API_BASE_URL, healthCheck } from "./api/client";


const STATUS_LABEL = {
  loading: "loading",
  connected: "connected",
  failed: "failed",
};


function App() {
  const [connectionStatus, setConnectionStatus] = useState("loading");
  const [healthResponse, setHealthResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

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
      <section className="status-panel" aria-labelledby="app-title">
        <div className="phase-label">Phase 0</div>
        <h1 id="app-title">Figure Community</h1>
        <p className="subtitle">Frontend + Backend connection</p>

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
        </dl>

        {connectionStatus === "connected" && (
          <pre className="response-box">
            {JSON.stringify(healthResponse, null, 2)}
          </pre>
        )}

        {connectionStatus === "failed" && (
          <p className="error-text">
            Backend connection failed: {errorMessage}
          </p>
        )}
      </section>
    </main>
  );
}


export default App;
