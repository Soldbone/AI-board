import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import Button from "../components/common/Button";
import Layout from "../components/common/Layout";
import Loading from "../components/common/Loading";
import HomePage from "../pages/HomePage";
import LoginPage from "../pages/LoginPage";
import MyPage from "../pages/MyPage";
import PostDetailPage from "../pages/PostDetailPage";
import PostEditPage from "../pages/PostEditPage";
import PostListPage from "../pages/PostListPage";
import PostWritePage from "../pages/PostWritePage";
import SearchResultPage from "../pages/SearchResultPage";
import SignupPage from "../pages/SignupPage";


function AppRouter({ auth }) {
  return (
    <BrowserRouter>
      <Layout auth={auth}>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/boards" element={<PostListRoute auth={auth} />} />
          <Route path="/boards/:boardCode" element={<PostListRoute auth={auth} />} />
          <Route path="/posts/:postId" element={<PostDetailRoute auth={auth} />} />
          <Route
            path="/posts/:postId/edit"
            element={
              <ProtectedRoute auth={auth}>
                <PostEditRoute currentUser={auth.user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/posts/new"
            element={
              <ProtectedRoute auth={auth}>
                <PostWriteRoute currentUser={auth.user} />
              </ProtectedRoute>
            }
          />
          <Route path="/search" element={<SearchRoute />} />
          <Route
            path="/mypage"
            element={
              <ProtectedRoute auth={auth}>
                <MyPageRoute auth={auth} />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginRoute auth={auth} />} />
          <Route path="/signup" element={<SignupRoute auth={auth} />} />
          <Route path="*" element={<NotFoundRoute />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}


function HomeRoute() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <HomePage
      onOpenBoard={(boardCode) => navigate(boardCode ? `/boards/${boardCode}` : "/boards")}
      onOpenPost={(postId) => navigateToPost(navigate, postId, location)}
    />
  );
}


function PostListRoute({ auth }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { boardCode = "" } = useParams();

  return (
    <PostListPage
      initialBoardCode={boardCode}
      isAuthenticated={auth.isAuthenticated}
      onBackHome={() => navigate("/")}
      onOpenPost={(postId) => navigateToPost(navigate, postId, location)}
      onOpenWrite={(selectedBoardCode) => {
        const query = selectedBoardCode
          ? `?board_code=${encodeURIComponent(selectedBoardCode)}`
          : "";
        navigate(`/posts/new${query}`);
      }}
    />
  );
}


function SearchRoute() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <SearchResultPage
      onBackHome={() => navigate("/")}
      onOpenPost={(postId) => navigateToPost(navigate, postId, location)}
    />
  );
}


function MyPageRoute({ auth }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <MyPage
      currentUser={auth.user}
      isAuthenticated={auth.isAuthenticated}
      onBackHome={() => navigate("/")}
      onOpenPost={(postId) => navigateToPost(navigate, postId, location)}
    />
  );
}


function PostDetailRoute({ auth }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { postId } = useParams();
  const listPath = location.state?.from || "/boards";

  return (
    <PostDetailPage
      currentUser={auth.user}
      postId={Number(postId)}
      onBackHome={() => navigate("/")}
      onBackToList={() => navigate(listPath)}
      onDeleted={() => navigate(listPath)}
      onEditPost={(selectedPostId) => {
        navigate(`/posts/${selectedPostId}/edit`, {
          state: { from: listPath },
        });
      }}
    />
  );
}


function PostWriteRoute({ currentUser }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialBoardCode = searchParams.get("board_code") || "";
  const listPath = initialBoardCode ? `/boards/${initialBoardCode}` : "/boards";

  return (
    <PostWritePage
      currentUser={currentUser}
      initialBoardCode={initialBoardCode}
      onCancel={() => navigate(listPath)}
      onCreated={(postId) => {
        navigate(`/posts/${postId}`, {
          state: { from: listPath },
        });
      }}
    />
  );
}


function PostEditRoute({ currentUser }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { postId } = useParams();
  const listPath = location.state?.from || "/boards";
  const detailPath = `/posts/${postId}`;

  function navigateToDetail(selectedPostId = postId) {
    navigate(`/posts/${selectedPostId}`, {
      state: { from: listPath },
    });
  }

  return (
    <PostEditPage
      currentUser={currentUser}
      postId={Number(postId)}
      onCancel={() => navigate(detailPath, { state: { from: listPath } })}
      onSaved={navigateToDetail}
    />
  );
}


function LoginRoute({ auth }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get("next") || "/mypage";

  if (auth.isAuthenticated) {
    return <Navigate replace to="/mypage" />;
  }

  async function handleLogin(payload) {
    await auth.login(payload);
    navigate(nextPath, { replace: true });
  }

  return (
    <div className="auth-route">
      <LoginPage onLogin={handleLogin} />
      {auth.errorMessage && (
        <p className="form-message error">{auth.errorMessage}</p>
      )}
    </div>
  );
}


function SignupRoute({ auth }) {
  if (auth.isAuthenticated) {
    return <Navigate replace to="/mypage" />;
  }

  return (
    <div className="auth-route">
      <SignupPage onSignup={auth.signup} />
      {auth.errorMessage && (
        <p className="form-message error">{auth.errorMessage}</p>
      )}
    </div>
  );
}


function ProtectedRoute({ auth, children }) {
  const location = useLocation();
  const nextPath = `${location.pathname}${location.search}`;

  if (auth.status === "loading") {
    return <Loading message="로그인 상태를 확인하는 중입니다." />;
  }

  if (!auth.isAuthenticated) {
    return (
      <section className="protected-panel" aria-labelledby="protected-title">
        <p className="eyebrow">Login Required</p>
        <h2 id="protected-title">로그인이 필요한 페이지입니다.</h2>
        <p className="empty-text">
          이 화면은 내 활동이나 글 관리를 위해 현재 로그인한 사용자를 확인해야 합니다.
        </p>
        <div className="protected-actions">
          <NavLink
            className="nav-link nav-link-strong"
            to={`/login?next=${encodeURIComponent(nextPath)}`}
          >
            로그인
          </NavLink>
          <NavLink className="nav-link" to="/signup">
            회원가입
          </NavLink>
        </div>
      </section>
    );
  }

  return children;
}


function NotFoundRoute() {
  return (
    <section className="page-section" aria-labelledby="not-found-title">
      <p className="eyebrow">Not Found</p>
      <h2 id="not-found-title">페이지를 찾을 수 없습니다.</h2>
      <p className="empty-text">주소를 다시 확인하거나 홈으로 이동해 주세요.</p>
      <div className="protected-actions">
        <NavLink className="nav-link nav-link-strong" to="/">
          홈으로
        </NavLink>
      </div>
    </section>
  );
}


function navigateToPost(navigate, postId, location) {
  navigate(`/posts/${postId}`, {
    state: {
      from: `${location.pathname}${location.search}`,
    },
  });
}


export default AppRouter;
