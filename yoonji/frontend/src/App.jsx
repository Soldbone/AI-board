import { useEffect, useState } from "react";

import "./App.css";
import { API_BASE_URL, healthCheck } from "./api/client";
import { useAuth } from "./hooks/useAuth";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import MyPage from "./pages/MyPage";
import PostDetailPage from "./pages/PostDetailPage";
import PostEditPage from "./pages/PostEditPage";
import PostListPage from "./pages/PostListPage";
import PostWritePage from "./pages/PostWritePage";
import SearchResultPage from "./pages/SearchResultPage";
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
  const [currentView, setCurrentView] = useState("home");
  const [returnView, setReturnView] = useState("posts");
  const [selectedBoardCode, setSelectedBoardCode] = useState("");
  const [selectedPostId, setSelectedPostId] = useState(null);
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

  function openHome() {
    setCurrentView("home");
    setSelectedBoardCode("");
    setSelectedPostId(null);
  }

  function openBoard(boardCode) {
    setCurrentView("posts");
    setReturnView("posts");
    setSelectedBoardCode(boardCode);
    setSelectedPostId(null);
  }

  function openSearch() {
    setCurrentView("search");
    setReturnView("search");
    setSelectedPostId(null);
  }

  function openMyPage() {
    setCurrentView("mypage");
    setReturnView("mypage");
    setSelectedPostId(null);
  }

  function openPost(postId, nextReturnView = currentView) {
    setCurrentView("detail");
    setReturnView(nextReturnView);
    setSelectedPostId(postId);
  }

  function openWrite(boardCode = "") {
    setCurrentView("write");
    setSelectedBoardCode(boardCode);
    setSelectedPostId(null);
  }

  function openEdit(postId) {
    setCurrentView("edit");
    setSelectedPostId(postId);
  }

  function backToList() {
    if (returnView === "home") {
      openHome();
      return;
    }

    if (returnView === "search") {
      openSearch();
      return;
    }

    if (returnView === "mypage") {
      openMyPage();
      return;
    }

    setCurrentView("posts");
    setSelectedPostId(null);
  }

  function handlePostCreated(postId) {
    openPost(postId, "posts");
  }

  function handlePostSaved(postId) {
    openPost(postId, returnView);
  }

  function handlePostDeleted() {
    backToList();
  }

  return (
    <main className="app-shell">
      <section className="app-header" aria-labelledby="app-title">
        <div className="app-header-topline">
          <div className="phase-label">Phase 9</div>
          <nav className="app-nav" aria-label="main navigation">
            <button type="button" className="text-button" onClick={openHome}>
              홈
            </button>
            <button type="button" className="text-button" onClick={() => openBoard("")}>
              게시글
            </button>
            <button type="button" className="text-button" onClick={openSearch}>
              검색
            </button>
            <button
              type="button"
              className="text-button"
              onClick={openMyPage}
              disabled={!auth.isAuthenticated}
            >
              마이페이지
            </button>
          </nav>
        </div>
        <h1 id="app-title">Figure Community</h1>
        <p className="subtitle">
          게시글 검색, 정렬, 필터와 내 활동 조회를 연습하는 MVP 게시판입니다.
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

      <div className="app-workspace">
        <section className="content-area" aria-label="board content">
          {currentView === "home" && (
            <HomePage
              onOpenBoard={openBoard}
              onOpenPost={(postId) => openPost(postId, "home")}
            />
          )}

          {currentView === "posts" && (
            <PostListPage
              initialBoardCode={selectedBoardCode}
              isAuthenticated={auth.isAuthenticated}
              onBackHome={openHome}
              onOpenPost={(postId) => openPost(postId, "posts")}
              onOpenWrite={openWrite}
            />
          )}

          {currentView === "search" && (
            <SearchResultPage
              onBackHome={openHome}
              onOpenPost={(postId) => openPost(postId, "search")}
            />
          )}

          {currentView === "mypage" && (
            <MyPage
              currentUser={auth.user}
              isAuthenticated={auth.isAuthenticated}
              onBackHome={openHome}
              onOpenPost={(postId) => openPost(postId, "mypage")}
            />
          )}

          {currentView === "detail" && (
            <PostDetailPage
              currentUser={auth.user}
              postId={selectedPostId}
              onBackHome={openHome}
              onBackToList={backToList}
              onDeleted={handlePostDeleted}
              onEditPost={openEdit}
            />
          )}

          {currentView === "write" && (
            <PostWritePage
              currentUser={auth.user}
              initialBoardCode={selectedBoardCode}
              onCancel={backToList}
              onCreated={handlePostCreated}
            />
          )}

          {currentView === "edit" && (
            <PostEditPage
              currentUser={auth.user}
              postId={selectedPostId}
              onCancel={() => openPost(selectedPostId, returnView)}
              onSaved={handlePostSaved}
            />
          )}
        </section>

        <aside className="auth-sidebar" aria-label="account">
          <AccountPanel auth={auth} onOpenMyPage={openMyPage} />
        </aside>
      </div>
    </main>
  );
}


function AccountPanel({ auth, onOpenMyPage }) {
  if (auth.user) {
    return (
      <section className="account-panel" aria-labelledby="account-title">
        <h2 id="account-title">내 정보</h2>

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
          <button type="button" onClick={onOpenMyPage}>
            내 활동 보기
          </button>
          <button type="button" className="secondary-button" onClick={auth.loadMe}>
            새로고침
          </button>
          <button type="button" className="text-button" onClick={auth.logout}>
            로그아웃
          </button>
        </div>

        {auth.errorMessage && (
          <p className="form-message error">{auth.errorMessage}</p>
        )}
      </section>
    );
  }

  return (
    <div className="auth-stack">
      <SignupPage onSignup={auth.signup} />
      <LoginPage onLogin={auth.login} />
      {auth.errorMessage && (
        <p className="form-message error">{auth.errorMessage}</p>
      )}
    </div>
  );
}


export default App;
