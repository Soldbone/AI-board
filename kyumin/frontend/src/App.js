(function () {
  const h = React.createElement;
  const { useEffect, useRef, useState } = React;

  const BOARDS = {
    idea: {
      label: "게임 아이디어 게시판",
      title: "게임 아이디어",
      emptyText: "아직 등록된 아이디어가 없습니다.",
    },
    review: {
      label: "게임 리뷰 게시판",
      title: "게임 리뷰",
      emptyText: "아직 등록된 리뷰가 없습니다.",
    },
  };

  // 앱의 최상위 상태를 관리한다. 라우터 없이 currentView와 selectedBoard로 화면을 전환한다.
  function App() {
    const storedUser = window.PotatoApi.getStoredUser();
    const [user, setUser] = useState(storedUser);
    const [currentView, setCurrentView] = useState("home");
    const [selectedBoard, setSelectedBoard] = useState("idea");
    const [boardResetKey, setBoardResetKey] = useState(0);
    const [pendingEmail, setPendingEmail] = useState("");
    const [sessionMessage, setSessionMessage] = useState("");
    const [checkingSession, setCheckingSession] = useState(Boolean(window.PotatoApi.getToken()));

    // 저장된 토큰이 있으면 서버의 현재 사용자 정보로 세션을 다시 확인한다.
    useEffect(() => {
      if (!window.PotatoApi.getToken()) {
        setCheckingSession(false);
        return;
      }

      let ignore = false;
      window.PotatoApi.me()
        .then((currentUser) => {
          if (ignore) {
            return;
          }

          const nextUser = currentUser?.user || currentUser;
          setUser(nextUser);
          setCurrentView("home");
          window.PotatoApi.saveSession(window.PotatoApi.getToken(), nextUser);
        })
        .catch(() => {
          if (ignore) {
            return;
          }

          window.PotatoApi.clearSession();
          setUser(null);
          setCurrentView("loginRequired");
          setSessionMessage("로그인 정보가 만료되었습니다.");
        })
        .finally(() => {
          if (!ignore) {
            setCheckingSession(false);
          }
        });

      return () => {
        ignore = true;
      };
    }, []);

    // 로그인과 이메일 인증 성공 결과를 같은 방식으로 세션에 반영한다.
    function completeLogin(authResult) {
      const nextUser = authResult.user;
      window.PotatoApi.saveSession(authResult.access_token, nextUser);
      setUser(nextUser);
      setCurrentView("board");
      setCheckingSession(false);
      setSessionMessage("");
    }

    // 보호된 화면이나 API를 쓰려는 비로그인 사용자를 로그인 안내 화면으로 보낸다.
    function requireLogin(message) {
      window.PotatoApi.clearSession();
      setUser(null);
      setCurrentView("loginRequired");
      setSessionMessage(message || "로그인 후 이용할 수 있습니다.");
    }

    // 게시판 탭이나 브랜드 버튼을 다시 눌러도 목록 화면을 새로 열도록 reset key를 올린다.
    function showBoard(boardType) {
      setSelectedBoard(boardType);
      setCurrentView("board");
      setBoardResetKey((currentKey) => currentKey + 1);
    }

    function showHome() {
      setCurrentView("home");
    }

    // 서버 로그아웃 실패와 상관없이 브라우저에 남은 로그인 정보는 정리한다.
    async function logout() {
      try {
        await window.PotatoApi.logout();
      } catch (error) {
        // 로그아웃은 클라이언트 세션 정리가 우선이다.
      }

      window.PotatoApi.clearSession();
      setUser(null);
      setCurrentView("login");
      setSessionMessage("로그아웃되었습니다.");
    }

    // 로그인 상태와 currentView 조합에 맞는 화면 컴포넌트를 고른다.
    function renderPage() {
      if (checkingSession) {
        return h(LoadingState, {
          title: "로그인 상태 확인 중입니다.",
          description: "저장된 세션을 확인하고 있습니다.",
        });
      }

      if (currentView === "home") {
        return h(HomeView, {
          user,
          onStart: () => (user ? showBoard(selectedBoard) : setCurrentView("login")),
        });
      }

      if (!user && currentView === "register") {
        return h(RegisterView, {
          onCodeRequested: (email) => {
            setPendingEmail(email);
            setCurrentView("verifyEmail");
          },
          onLoginClick: () => setCurrentView("login"),
        });
      }

      if (!user && currentView === "verifyEmail") {
        return h(VerifyEmailView, {
          initialEmail: pendingEmail,
          onVerified: completeLogin,
          onBack: () => setCurrentView("register"),
        });
      }

      if (!user && currentView === "loginRequired") {
        return h(LoginRequiredView, {
          message: sessionMessage,
          onLoginClick: () => setCurrentView("login"),
          onRegisterClick: () => setCurrentView("register"),
        });
      }

      if (!user) {
        return h(LoginView, {
          sessionMessage,
          onLogin: completeLogin,
          onRegisterClick: () => setCurrentView("register"),
        });
      }

      if (currentView === "profile") {
        return h(ProfileView, {
          user,
          onBack: () => setCurrentView("board"),
          onUserChange: (nextUser) => {
            setUser(nextUser);
            window.PotatoApi.saveSession(window.PotatoApi.getToken(), nextUser);
          },
          onAccountDeleted: () => {
            window.PotatoApi.clearSession();
            setUser(null);
            setCurrentView("login");
            setSessionMessage("계정이 삭제되었습니다.");
          },
        });
      }

      return h(BoardHome, {
        key: `${selectedBoard}-${boardResetKey}`,
        selectedBoard,
        user,
        onRequireLogin: requireLogin,
      });
    }

    return h(
      "div",
      { className: "app" },
      h(Header, {
        user,
        currentView,
        selectedBoard,
        onHomeClick: showHome,
        onBoardChange: showBoard,
        onProfileClick: () => setCurrentView("profile"),
        onLoginClick: () => setCurrentView("login"),
        onRegisterClick: () => setCurrentView("register"),
        onLogout: logout,
      }),
      h("main", { className: currentView === "home" ? "app-main home-main" : "app-main" }, renderPage())
    );
  }

  // 상단 공통 레이아웃이다. 로그인 상태에 따라 게시판 탭과 계정 메뉴를 다르게 보여준다.
  function Header({
    user,
    currentView,
    selectedBoard,
    onHomeClick,
    onBoardChange,
    onProfileClick,
    onLoginClick,
    onRegisterClick,
    onLogout,
  }) {
    return h(
      "header",
      { className: "topbar" },
      h(
        "button",
        {
          className: "brand-button",
          type: "button",
          "aria-label": "메인 화면으로 이동",
          title: "메인",
          onClick: onHomeClick,
        },
        h(PotatoLogoMark),
        h("span", null, "Potato maker")
      ),
      user
        ? h(
            "nav",
            { className: "topbar-nav", "aria-label": "게시판" },
            Object.keys(BOARDS).map((boardType) =>
              h(
                "button",
                {
                  key: boardType,
                  className:
                    selectedBoard === boardType && currentView === "board"
                      ? "nav-button is-active"
                      : "nav-button",
                  type: "button",
                  onClick: () => onBoardChange(boardType),
                },
                BOARDS[boardType].label
              )
            )
          )
        : null,
      h(
        "div",
        { className: "account-area" },
        user
          ? h(
              React.Fragment,
              null,
              h(
                "button",
                {
                  className:
                    currentView === "profile" ? "account-button is-active" : "account-button",
                  type: "button",
                  onClick: onProfileClick,
                },
                user.nickname || user.email
              ),
              h(
                "button",
                { className: "ghost-button", type: "button", onClick: onLogout },
                "로그아웃"
              )
            )
          : h(
              React.Fragment,
              null,
              h(
                "button",
                {
                  className: currentView === "login" ? "nav-button is-active" : "nav-button",
                  type: "button",
                  onClick: onLoginClick,
                },
                "로그인"
              ),
              h(
                "button",
                {
                  className: currentView === "register" ? "nav-button is-active" : "nav-button",
                  type: "button",
                  onClick: onRegisterClick,
                },
                "회원가입"
              )
            )
      )
    );
  }

  // 브랜드를 글자가 아니라 실제 감자 형태의 마크로 보여준다.
  function PotatoLogoMark({ variant = "compact" } = {}) {
    const className =
      variant === "portal"
        ? "brand-mark potato-logo-mark potato-logo-mark-large"
        : "brand-mark potato-logo-mark";

    return h(
      "span",
      { className, "aria-hidden": "true" },
      h(
        "svg",
        {
          className: "potato-svg-logo",
          viewBox: "0 0 128 128",
          role: "img",
          focusable: "false",
        },
        h(
          "defs",
          null,
          h(
            "radialGradient",
            { id: "potatoSkinLight", cx: "30%", cy: "27%", r: "86%" },
            h("stop", { offset: "0%", stopColor: "#e8bd72" }),
            h("stop", { offset: "48%", stopColor: "#b77a3b" }),
            h("stop", { offset: "100%", stopColor: "#67401e" })
          ),
          h(
            "linearGradient",
            { id: "potatoSkinShade", x1: "18%", y1: "10%", x2: "88%", y2: "92%" },
            h("stop", { offset: "0%", stopColor: "#f2cb82", stopOpacity: "0.42" }),
            h("stop", { offset: "52%", stopColor: "#8f592b", stopOpacity: "0.2" }),
            h("stop", { offset: "100%", stopColor: "#3d2613", stopOpacity: "0.54" })
          ),
          h(
            "filter",
            { id: "potatoRoughSkin", x: "-12%", y: "-12%", width: "124%", height: "124%" },
            h("feTurbulence", {
              type: "fractalNoise",
              baseFrequency: "0.92",
              numOctaves: "3",
              seed: "7",
              result: "noise",
            }),
            h("feColorMatrix", {
              in: "noise",
              type: "matrix",
              values: "0 0 0 0 0.34 0 0 0 0 0.2 0 0 0 0 0.08 0 0 0 0.22 0",
              result: "skinNoise",
            }),
            h("feBlend", { in: "SourceGraphic", in2: "skinNoise", mode: "multiply" })
          )
        ),
        h("ellipse", {
          className: "potato-ground-shadow",
          cx: "66",
          cy: "99",
          rx: "49",
          ry: "11",
        }),
        h("path", {
          className: "potato-main-shape",
          d:
            "M28 44 C21 34 31 22 45 23 C51 14 68 17 78 25 C93 22 107 34 107 49 C119 61 106 80 92 84 C87 100 62 103 52 94 C38 101 20 89 22 74 C11 65 17 50 28 44 Z",
          filter: "url(#potatoRoughSkin)",
        }),
        h("path", {
          className: "potato-shade-layer",
          d:
            "M28 44 C21 34 31 22 45 23 C51 14 68 17 78 25 C93 22 107 34 107 49 C119 61 106 80 92 84 C87 100 62 103 52 94 C38 101 20 89 22 74 C11 65 17 50 28 44 Z",
        }),
        h("path", {
          className: "potato-highlight-svg",
          d: "M35 34 C45 25 61 23 72 29 C56 30 42 39 33 52 C29 45 30 38 35 34 Z",
        }),
        h("path", {
          className: "potato-bump potato-bump-a",
          d: "M23 58 C16 62 18 72 24 78 C20 70 20 63 23 58 Z",
        }),
        h("path", {
          className: "potato-bump potato-bump-b",
          d: "M92 32 C104 38 108 51 104 62 C101 49 98 40 92 32 Z",
        }),
        h("ellipse", { className: "potato-eye-svg eye-svg-a", cx: "46", cy: "46", rx: "5.3", ry: "3.5" }),
        h("ellipse", { className: "potato-eye-svg eye-svg-b", cx: "75", cy: "37", rx: "4.4", ry: "3.1" }),
        h("ellipse", { className: "potato-eye-svg eye-svg-c", cx: "85", cy: "65", rx: "5.6", ry: "3.9" }),
        h("ellipse", { className: "potato-eye-svg eye-svg-d", cx: "55", cy: "81", rx: "5.2", ry: "3.6" }),
        h("ellipse", { className: "potato-eye-svg eye-svg-e", cx: "34", cy: "66", rx: "3.7", ry: "2.8" }),
        h("path", { className: "potato-root-svg root-svg-a", d: "M40 57 C47 53 53 55 59 60" }),
        h("path", { className: "potato-root-svg root-svg-b", d: "M70 75 C78 72 84 74 90 79" }),
        h("path", { className: "potato-root-svg root-svg-c", d: "M50 91 C57 88 64 90 71 95" }),
        h("circle", { className: "potato-freckle-svg", cx: "39", cy: "37", r: "1.5" }),
        h("circle", { className: "potato-freckle-svg", cx: "63", cy: "49", r: "1.2" }),
        h("circle", { className: "potato-freckle-svg", cx: "94", cy: "55", r: "1.5" }),
        h("circle", { className: "potato-freckle-svg", cx: "43", cy: "73", r: "1.3" }),
        h("circle", { className: "potato-freckle-svg", cx: "69", cy: "90", r: "1.6" })
      )
    );
  }

  // 서비스 첫 화면이다. 로고에서 돌아오고 시작하기로 게시판 흐름에 진입한다.
  function HomeView({ user, onStart }) {
    return h(
      "section",
      { className: "home-portal" },
      h(
        "div",
        { className: "portal-stage", "aria-hidden": "true" },
        h("span", { className: "portal-ring portal-ring-a" }),
        h("span", { className: "portal-ring portal-ring-b" }),
        h("span", { className: "portal-ring portal-ring-c" }),
        h("span", { className: "portal-core" }),
        h("span", { className: "portal-gate gate-top" }),
        h("span", { className: "portal-gate gate-right" }),
        h("span", { className: "portal-gate gate-bottom" }),
        h("span", { className: "portal-gate gate-left" }),
        h("span", { className: "portal-tile portal-tile-1" }),
        h("span", { className: "portal-tile portal-tile-2" }),
        h("span", { className: "portal-tile portal-tile-3" }),
        h("span", { className: "portal-tile portal-tile-4" }),
        h("span", { className: "portal-shard shard-1" }),
        h("span", { className: "portal-shard shard-2" }),
        h("span", { className: "portal-shard shard-3" }),
        h("span", { className: "portal-shard shard-4" }),
        h("span", { className: "portal-runway" })
      ),
      h(
        "div",
        { className: "home-portal-title" },
        h(
          "div",
          { className: "home-logo-lockup", "aria-label": "Potato maker 감자 로고" },
          h(PotatoLogoMark, { variant: "portal" })
        ),
        h("h1", null, "당신의 아이디어를 하나로"),
        h(
          "button",
          { className: "home-start-button", type: "button", onClick: onStart },
          "시작하기"
        )
      )
    );
  }

  // 보호된 화면을 비로그인 상태로 열었을 때 로그인으로 이어 주는 안내 화면이다.
  function LoginRequiredView({ message, onLoginClick, onRegisterClick }) {
    return h(
      "section",
      { className: "auth-panel" },
      h("div", { className: "section-eyebrow" }, "로그인 필요"),
      h("h1", null, "로그인이 필요합니다"),
      h("p", { className: "muted-text" }, message || "로그인 후 이용할 수 있습니다."),
      h(
        "div",
        { className: "button-row" },
        h("button", { className: "primary-button", type: "button", onClick: onLoginClick }, "로그인"),
        h("button", { className: "ghost-button", type: "button", onClick: onRegisterClick }, "회원가입")
      )
    );
  }

  // 주요 화면에서 API 대기 상태를 같은 모양으로 보여준다.
  function LoadingState({ title, description, compact = false }) {
    return h(
      "div",
      { className: compact ? "state-box is-compact" : "state-box", role: "status" },
      h("span", { className: "loading-dot", "aria-hidden": "true" }),
      h("h2", null, title),
      description ? h("p", null, description) : null
    );
  }

  // 목록, 댓글, AI 결과처럼 비어 있는 상태를 같은 모양으로 보여준다.
  function EmptyState({ title, description, actionLabel, onAction, compact = false, className = "" }) {
    const stateClassName = ["state-box", compact ? "is-compact" : "", className]
      .filter(Boolean)
      .join(" ");

    return h(
      "div",
      { className: stateClassName },
      h("h2", null, title),
      description ? h("p", null, description) : null,
      actionLabel && onAction
        ? h("button", { className: "ghost-button", type: "button", onClick: onAction }, actionLabel)
        : null
    );
  }

  // 이메일과 비밀번호로 JWT 로그인을 요청하는 화면이다.
  function LoginView({ sessionMessage, onLogin, onRegisterClick }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // 로그인 API 성공 시 상위 App에 세션 저장을 맡긴다.
    async function submit(event) {
      event.preventDefault();
      setError("");
      setLoading(true);

      try {
        const authResult = await window.PotatoApi.login({ email, password });
        onLogin(authResult);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    // 로그인 입력칸에서 Enter를 누르면 확인 버튼과 같은 submit 경로를 사용한다.
    function submitOnEnter(event) {
      if (event.key !== "Enter" || loading) {
        return;
      }

      event.preventDefault();
      event.currentTarget.requestSubmit();
    }

    return h(
      "section",
      { className: "auth-panel" },
      h("div", { className: "section-eyebrow" }, "로그인"),
      h("h1", null, "계정으로 들어가기"),
      h(StatusMessage, { error, success: sessionMessage }),
      h(
        "form",
        { className: "form-stack", onSubmit: submit, onKeyDown: submitOnEnter },
        h(TextField, {
          id: "login-email",
          label: "아이디(이메일)",
          type: "email",
          value: email,
          onChange: setEmail,
          required: true,
          autoComplete: "username",
          autoFocus: true,
        }),
        h(TextField, {
          id: "login-password",
          label: "비밀번호",
          type: "password",
          value: password,
          onChange: setPassword,
          required: true,
          autoComplete: "current-password",
        }),
        h(
          "button",
          { className: "primary-button", type: "submit", disabled: loading },
          loading ? "확인 중" : "확인"
        )
      ),
      h(
        "button",
        { className: "text-button", type: "button", onClick: onRegisterClick },
        "회원가입"
      )
    );
  }

  // 회원가입 첫 단계다. 이메일과 비밀번호를 보내고 인증코드 입력 화면으로 넘긴다.
  function RegisterView({ onCodeRequested, onLoginClick }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // 서버가 인증코드를 만들면 이메일 값을 다음 화면에 전달한다.
    async function submit(event) {
      event.preventDefault();
      setError("");
      setLoading(true);

      try {
        await window.PotatoApi.requestCode({ email, password });
        onCodeRequested(email);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    return h(
      "section",
      { className: "auth-panel" },
      h("div", { className: "section-eyebrow" }, "회원가입"),
      h("h1", null, "새 계정 만들기"),
      h(StatusMessage, { error }),
      h(
        "form",
        { className: "form-stack", onSubmit: submit },
        h(TextField, {
          id: "register-email",
          label: "이메일",
          type: "email",
          value: email,
          onChange: setEmail,
          required: true,
          autoComplete: "username",
        }),
        h(TextField, {
          id: "register-password",
          label: "비밀번호",
          type: "password",
          value: password,
          onChange: setPassword,
          required: true,
          minLength: 8,
          autoComplete: "new-password",
        }),
        h(
          "button",
          { className: "primary-button", type: "submit", disabled: loading },
          loading ? "요청 중" : "인증코드 요청"
        )
      ),
      h(
        "button",
        { className: "text-button", type: "button", onClick: onLoginClick },
        "로그인"
      )
    );
  }

  // 회원가입 두 번째 단계다. 서버 콘솔/메일로 받은 인증코드를 확인한다.
  function VerifyEmailView({ initialEmail, onVerified, onBack }) {
    const [email, setEmail] = useState(initialEmail || "");
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // 인증 성공 응답도 로그인 응답과 같은 형태로 다뤄 바로 로그인 상태가 된다.
    async function submit(event) {
      event.preventDefault();
      setError("");
      setLoading(true);

      try {
        const authResult = await window.PotatoApi.verifyRegister({ email, code });
        onVerified(authResult);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    return h(
      "section",
      { className: "auth-panel" },
      h("div", { className: "section-eyebrow" }, "이메일 인증"),
      h("h1", null, "인증코드 확인"),
      h(StatusMessage, { error }),
      h(
        "form",
        { className: "form-stack", onSubmit: submit },
        h(TextField, {
          id: "verify-email",
          label: "이메일",
          type: "email",
          value: email,
          onChange: setEmail,
          required: true,
        }),
        h(TextField, {
          id: "verify-code",
          label: "인증코드",
          value: code,
          onChange: setCode,
          required: true,
          inputMode: "numeric",
        }),
        h(
          "button",
          { className: "primary-button", type: "submit", disabled: loading },
          loading ? "확인 중" : "가입 완료"
        )
      ),
      h("button", { className: "text-button", type: "button", onClick: onBack }, "이전")
    );
  }

  // 마이페이지다. 닉네임, OpenAI API Key, 회원 탈퇴처럼 사용자 단위 기능을 모아 둔다.
  function ProfileView({ user, onBack, onUserChange, onAccountDeleted }) {
    const [nickname, setNickname] = useState(user.nickname || "");
    const [apiKey, setApiKey] = useState("");
    const [apiKeyInfo, setApiKeyInfo] = useState(null);
    const [loadingKey, setLoadingKey] = useState(false);
    const [savingNickname, setSavingNickname] = useState(false);
    const [savingApiKey, setSavingApiKey] = useState(false);
    const [deletingAccount, setDeletingAccount] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    // API Key 원문은 다시 받지 않고 등록 여부와 마지막 4자리만 조회한다.
    useEffect(() => {
      let ignore = false;
      setLoadingKey(true);

      window.PotatoApi.getApiKey()
        .then((data) => {
          if (!ignore) {
            setApiKeyInfo(data);
          }
        })
        .catch((requestError) => {
          if (!ignore) {
            setError(requestError.message);
          }
        })
        .finally(() => {
          if (!ignore) {
            setLoadingKey(false);
          }
        });

      return () => {
        ignore = true;
      };
    }, []);

    // 닉네임만 수정 가능하므로 응답 사용자 정보와 현재 세션 정보를 합쳐 갱신한다.
    async function saveNickname(event) {
      event.preventDefault();
      setError("");
      setMessage("");
      setSavingNickname(true);

      try {
        const result = await window.PotatoApi.updateNickname({ nickname });
        const resultUser = result?.user || result || {};
        const nextUser = {
          ...user,
          ...resultUser,
          nickname: resultUser.nickname ?? nickname,
        };
        onUserChange(nextUser);
        setMessage("닉네임이 저장되었습니다.");
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setSavingNickname(false);
      }
    }

    // API Key 원문은 저장 요청에만 사용하고 성공 후 입력칸에서 바로 지운다.
    async function saveApiKey(event) {
      event.preventDefault();
      setError("");
      setMessage("");
      setSavingApiKey(true);

      try {
        const data = await window.PotatoApi.saveApiKey({ apiKey });
        setApiKeyInfo(data);
        setApiKey("");
        setMessage("API Key가 저장되었습니다.");
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setSavingApiKey(false);
      }
    }

    // API Key 삭제 후 화면에는 미등록 상태만 남긴다.
    async function deleteApiKey() {
      setError("");
      setMessage("");

      try {
        await window.PotatoApi.deleteApiKey();
        setApiKeyInfo({ provider: "openai", has_api_key: false, api_key_last4: null });
        setMessage("API Key가 삭제되었습니다.");
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    // 탈퇴는 작성 기록 삭제가 걸린 위험 동작이므로 사용자 확인을 한 번 거친다.
    async function deleteAccount() {
      if (!window.confirm("계정과 작성 기록을 모두 삭제할까요?")) {
        return;
      }

      setError("");
      setMessage("");
      setDeletingAccount(true);

      try {
        await window.PotatoApi.deleteMe();
        onAccountDeleted();
      } catch (requestError) {
        setError(requestError.message);
        setDeletingAccount(false);
      }
    }

    return h(
      "section",
      { className: "profile-layout" },
      h(
        "div",
        { className: "section-header" },
        h("div", null, h("div", { className: "section-eyebrow" }, "마이페이지"), h("h1", null, "내 정보")),
        h("button", { className: "ghost-button", type: "button", onClick: onBack }, "게시판")
      ),
      h(StatusMessage, { error, success: message }),
      h(
        "div",
        { className: "profile-grid" },
        h(
          "form",
          { className: "settings-panel", onSubmit: saveNickname },
          h("h2", null, "프로필"),
          h(ReadOnlyField, { label: "이메일", value: user.email }),
          h(TextField, {
            id: "profile-nickname",
            label: "닉네임",
            value: nickname,
            onChange: setNickname,
            placeholder: "닉네임",
          }),
          h(
            "button",
            { className: "primary-button", type: "submit", disabled: savingNickname },
            savingNickname ? "저장 중" : "닉네임 저장"
          )
        ),
        h(
          "form",
          { className: "settings-panel", onSubmit: saveApiKey },
          h("h2", null, "OpenAI API Key"),
          h(
            "p",
            { className: "key-state" },
            loadingKey
              ? "확인 중"
              : apiKeyInfo?.has_api_key
                ? `등록됨: ****${apiKeyInfo.api_key_last4 || ""}`
                : "등록되지 않음"
          ),
          h(TextField, {
            id: "profile-api-key",
            label: "새 API Key",
            type: "password",
            value: apiKey,
            onChange: setApiKey,
            placeholder: "sk-...",
            required: true,
          }),
          h(
            "div",
            { className: "button-row" },
            h(
              "button",
              { className: "primary-button", type: "submit", disabled: savingApiKey },
              savingApiKey ? "저장 중" : "저장"
            ),
            h(
              "button",
              {
                className: "danger-button",
                type: "button",
                onClick: deleteApiKey,
                disabled: !apiKeyInfo?.has_api_key,
              },
              "삭제"
            )
          )
        ),
        h(
          "section",
          { className: "settings-panel danger-zone" },
          h("h2", null, "회원 탈퇴"),
          h("p", null, "계정 정보와 작성 기록을 삭제합니다."),
          h(
            "button",
            {
              className: "danger-button",
              type: "button",
              onClick: deleteAccount,
              disabled: deletingAccount,
            },
            deletingAccount ? "삭제 중" : "계정 삭제"
          )
        )
      )
    );
  }

  // 게시판 프론트의 최상위 화면이다. 목록, 작성, 상세 화면 상태를 한곳에서 전환한다.
  function BoardHome({ selectedBoard, user, onRequireLogin }) {
    const board = BOARDS[selectedBoard];
    const [boardView, setBoardView] = useState("list");
    const [searchText, setSearchText] = useState("");
    const [submittedSearch, setSubmittedSearch] = useState("");
    const [page, setPage] = useState(1);
    const [postPage, setPostPage] = useState({ items: [], page: 1, page_size: 10, total: 0 });
    const [selectedPostId, setSelectedPostId] = useState(null);
    const [editingPost, setEditingPost] = useState(null);
    const [listRefreshKey, setListRefreshKey] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const latestRouteRef = useRef(null);

    // 게시판 탭이 바뀌면 검색어와 선택 글 상태를 초기화한다.
    useEffect(() => {
      setBoardView("list");
      setSearchText("");
      setSubmittedSearch("");
      setPage(1);
      setSelectedPostId(null);
      setEditingPost(null);
      setError("");
    }, [selectedBoard]);

    // React state 화면 전환을 브라우저 뒤로 가기와 연결한다.
    useEffect(() => {
      const initialRoute = buildBoardHistoryState(selectedBoard, {
        boardView: "list",
        selectedPostId: null,
        editingPost: null,
      });
      latestRouteRef.current = initialRoute;
      replaceBrowserHistory(initialRoute);

      function handleBrowserBack(event) {
        const nextRoute = event.state;
        if (!isBoardHistoryState(nextRoute) || nextRoute.selectedBoard !== selectedBoard) {
          return;
        }

        latestRouteRef.current = nextRoute;
        setBoardView(nextRoute.boardView || "list");
        setSelectedPostId(nextRoute.selectedPostId || null);
        setEditingPost(nextRoute.editingPost || null);
      }

      window.addEventListener("popstate", handleBrowserBack);
      return () => {
        window.removeEventListener("popstate", handleBrowserBack);
      };
    }, [selectedBoard]);

    // 목록 API는 게시판, 검색어, 페이지, 새로고침 신호가 바뀔 때 다시 읽는다.
    useEffect(() => {
      let ignore = false;
      setLoading(true);
      setError("");

      window.PotatoApi.listPosts({
        boardType: selectedBoard,
        search: submittedSearch,
        page,
        pageSize: 10,
      })
        .then((data) => {
          if (ignore) {
            return;
          }

          setPostPage({
            items: data?.items || [],
            page: data?.page || page,
            page_size: data?.page_size || 10,
            total: data?.total || 0,
          });
        })
        .catch((requestError) => {
          if (!ignore) {
            if (
              handleProtectedApiError(
                requestError,
                onRequireLogin,
                "로그인 후 게시판을 이용할 수 있습니다."
              )
            ) {
              return;
            }
            setError(requestError.message);
          }
        })
        .finally(() => {
          if (!ignore) {
            setLoading(false);
          }
        });

      return () => {
        ignore = true;
      };
    }, [selectedBoard, submittedSearch, page, listRefreshKey]);

    function refreshList() {
      setListRefreshKey((currentKey) => currentKey + 1);
    }

    // 검색은 입력 중에는 API를 부르지 않고 제출 시점에만 목록 조건으로 반영한다.
    function submitSearch(event) {
      event.preventDefault();
      setPage(1);
      setSubmittedSearch(searchText.trim());
    }

    function showList() {
      const nextRoute = buildBoardHistoryState(selectedBoard, {
        boardView: "list",
        selectedPostId: null,
        editingPost: null,
      });
      pushBrowserHistory(nextRoute, latestRouteRef);
      setBoardView("list");
      setSelectedPostId(null);
      setEditingPost(null);
      refreshList();
    }

    function showCreateForm() {
      if (!ensureProtectedAction(user, onRequireLogin, "로그인 후 글을 작성할 수 있습니다.")) {
        return;
      }

      setEditingPost(null);
      const nextRoute = buildBoardHistoryState(selectedBoard, {
        boardView: "form",
        selectedPostId: null,
        editingPost: null,
      });
      pushBrowserHistory(nextRoute, latestRouteRef);
      setBoardView("form");
    }

    function showDetail(postId) {
      if (!ensureProtectedAction(user, onRequireLogin, "로그인 후 게시글을 확인할 수 있습니다.")) {
        return;
      }

      const nextRoute = buildBoardHistoryState(selectedBoard, {
        boardView: "detail",
        selectedPostId: postId,
        editingPost: null,
      });
      pushBrowserHistory(nextRoute, latestRouteRef);
      setSelectedPostId(postId);
      setBoardView("detail");
    }

    function showEditForm(post) {
      const nextRoute = buildBoardHistoryState(selectedBoard, {
        boardView: "form",
        selectedPostId: post.id,
        editingPost: post,
      });
      pushBrowserHistory(nextRoute, latestRouteRef);
      setEditingPost(post);
      setBoardView("form");
    }

    function handlePostSaved(savedPost) {
      const nextRoute = buildBoardHistoryState(selectedBoard, {
        boardView: "detail",
        selectedPostId: savedPost.id,
        editingPost: null,
      });
      replaceBrowserHistory(nextRoute, latestRouteRef);
      refreshList();
      setEditingPost(null);
      setSelectedPostId(savedPost.id);
      setBoardView("detail");
    }

    function handlePostDeleted() {
      const nextRoute = buildBoardHistoryState(selectedBoard, {
        boardView: "list",
        selectedPostId: null,
        editingPost: null,
      });
      replaceBrowserHistory(nextRoute, latestRouteRef);
      setSelectedPostId(null);
      setBoardView("list");
      refreshList();
    }

    if (boardView === "form") {
      return h(PostForm, {
        boardType: selectedBoard,
        initialPost: editingPost,
        user,
        onCancel: editingPost ? () => showDetail(editingPost.id) : showList,
        onSaved: handlePostSaved,
        onRequireLogin,
      });
    }

    if (boardView === "detail" && selectedPostId) {
      return h(PostDetail, {
        postId: selectedPostId,
        boardType: selectedBoard,
        user,
        onBack: showList,
        onEdit: showEditForm,
        onDeleted: handlePostDeleted,
        onRequireLogin,
      });
    }

    return h(BoardList, {
      boardType: selectedBoard,
      board,
      postPage,
      loading,
      error,
      searchText,
      onSearchTextChange: setSearchText,
      onSearchSubmit: submitSearch,
      onCreateClick: showCreateForm,
      onOpenPost: showDetail,
      onPageChange: setPage,
    });
  }

  // 게시글 목록 화면이다. 게시판별 검색, 글쓰기, 페이지 이동을 제공한다.
  function BoardList({
    boardType,
    board,
    postPage,
    loading,
    error,
    searchText,
    onSearchTextChange,
    onSearchSubmit,
    onCreateClick,
    onOpenPost,
    onPageChange,
  }) {
    const totalPages = Math.max(1, Math.ceil((postPage.total || 0) / (postPage.page_size || 10)));

    return h(
      "section",
      { className: "board-shell" },
      h(
        "div",
        { className: "board-title-row" },
        h("div", null, h("div", { className: "section-eyebrow" }, "게시판"), h("h1", null, board.title)),
        h("button", { className: "primary-button", type: "button", onClick: onCreateClick }, "글쓰기")
      ),
      h(
        "form",
        { className: "board-search", onSubmit: onSearchSubmit },
        h("input", {
          "aria-label": `${board.title} 검색`,
          value: searchText,
          placeholder: "검색어",
          onChange: (event) => onSearchTextChange(event.target.value),
        }),
        h("button", { className: "ghost-button", type: "submit" }, "검색")
      ),
      h(StatusMessage, { error }),
      loading
        ? h(LoadingState, {
            title: "목록을 불러오는 중입니다.",
            description: `${board.title} 게시글을 확인하고 있습니다.`,
          })
        : postPage.items.length === 0
          ? h(EmptyState, {
              title: board.emptyText,
              description: "글쓰기를 눌러 첫 게시글을 남길 수 있습니다.",
            })
          : h(
              "div",
              { className: "post-list" },
              postPage.items.map((post) =>
                h(PostListItemView, {
                  key: post.id,
                  boardType,
                  post,
                  onOpen: () => onOpenPost(post.id),
                })
              )
            ),
      h(
        "div",
        { className: "pagination-row" },
        h(
          "button",
          {
            className: "ghost-button",
            type: "button",
            disabled: postPage.page <= 1,
            onClick: () => onPageChange(postPage.page - 1),
          },
          "이전"
        ),
        h("span", null, `${postPage.page} / ${totalPages}`),
        h(
          "button",
          {
            className: "ghost-button",
            type: "button",
            disabled: postPage.page >= totalPages,
            onClick: () => onPageChange(postPage.page + 1),
          },
          "다음"
        )
      )
    );
  }

  // 목록 한 줄에 게시글 핵심 정보를 모아 보여준다.
  function PostListItemView({ boardType, post, onOpen }) {
    const summaryText =
      boardType === "idea"
        ? post.core_fun || post.content || "핵심 재미가 아직 없습니다."
        : post.source_url || post.content || "게임 설명이 아직 없습니다.";

    return h(
      "article",
      { className: "post-list-item" },
      h(
        "button",
        { className: "post-open-button", type: "button", onClick: onOpen },
        h(
          "div",
          { className: "post-list-main" },
          h("h2", null, post.title),
          h("p", null, truncateText(summaryText, 120)),
          h(TagList, { tags: post.tags })
        ),
        h(
          "div",
          { className: "post-list-meta" },
          h("span", null, getAuthorName(post.author)),
          h("span", null, formatDate(post.created_at)),
          h("span", null, `댓글 ${post.comment_count || 0}`),
          boardType === "review"
            ? h("span", null, `별점 ${formatRating(post.average_rating)} (${post.review_count || 0})`)
            : null
        )
      )
    );
  }

  // 게시글 작성/수정 폼이다. 게시판 종류에 맞는 필드만 API payload로 만든다.
  function PostForm({ boardType, initialPost, user, onCancel, onSaved, onRequireLogin }) {
    const isEditing = Boolean(initialPost);
    const [form, setForm] = useState(() => buildPostFormState(initialPost));
    const [ragItems, setRagItems] = useState([]);
    const [ragFeedback, setRagFeedback] = useState(null);
    const [ragSearched, setRagSearched] = useState(false);
    const [ragLoading, setRagLoading] = useState(false);
    const [ragError, setRagError] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    function updateForm(name, value) {
      setForm((currentForm) => ({
        ...currentForm,
        [name]: value,
      }));
    }

    // 제목만 먼저 보내 RAG 관련 게시글을 확인한다.
    async function previewRelatedPosts() {
      if (!ensureProtectedAction(user, onRequireLogin, "로그인 후 RAG 미리확인을 사용할 수 있습니다.")) {
        return;
      }

      setRagError("");
      setRagItems([]);
      setRagFeedback(null);
      setRagSearched(true);
      setRagLoading(true);

      try {
        const result = await window.PotatoApi.recommendPostsByTitle({ title: form.title });
        setRagItems(result.items || []);
        setRagFeedback({
          summary: result.summary || "",
          duplicateRisk: result.duplicate_risk || "",
          suggestion: result.suggestion || "",
        });
      } catch (requestError) {
        if (
          handleProtectedApiError(
            requestError,
            onRequireLogin,
            "로그인이 만료되었습니다. 다시 로그인하세요."
          )
        ) {
          return;
        }
        setRagError(requestError.message);
      } finally {
        setRagLoading(false);
      }
    }

    // 저장 성공 후에는 상세 화면으로 이동해 방금 저장한 내용을 바로 확인하게 한다.
    async function submit(event) {
      event.preventDefault();
      if (!ensureProtectedAction(user, onRequireLogin, "로그인 후 글을 저장할 수 있습니다.")) {
        return;
      }

      setError("");
      setLoading(true);

      try {
        const payload = buildPostPayload(boardType, form);
        const savedPost = isEditing
          ? await window.PotatoApi.updatePost(initialPost.id, removeBoardType(payload))
          : await window.PotatoApi.createPost(payload);
        onSaved(savedPost);
      } catch (requestError) {
        if (
          handleProtectedApiError(
            requestError,
            onRequireLogin,
            "로그인이 만료되었습니다. 다시 로그인하세요."
          )
        ) {
          return;
        }
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    return h(
      "section",
      { className: "board-shell" },
      h(
        "div",
        { className: "board-title-row" },
        h(
          "div",
          null,
          h("div", { className: "section-eyebrow" }, isEditing ? "게시글 수정" : "글쓰기"),
          h("h1", null, `${BOARDS[boardType].title} ${isEditing ? "수정" : "작성"}`)
        ),
        h("button", { className: "ghost-button", type: "button", onClick: onCancel }, "취소")
      ),
      h(StatusMessage, { error }),
      h(
        "form",
        { className: "post-form", onSubmit: submit },
        h(
          "div",
          { className: "rag-title-row" },
          h(TextField, {
            id: "post-title",
            label: "제목",
            value: form.title,
            onChange: (value) => updateForm("title", value),
            required: true,
          }),
          h(
            "button",
            {
              className: "ghost-button",
              type: "button",
              onClick: previewRelatedPosts,
              disabled: ragLoading || !form.title.trim(),
            },
            ragLoading ? "확인 중" : "미리확인"
          )
        ),
        h(RagRecommendationPanel, {
          items: ragItems,
          feedback: ragFeedback,
          searched: ragSearched,
          loading: ragLoading,
          error: ragError,
        }),
        boardType === "idea"
          ? h(IdeaPostFields, { form, updateForm })
          : h(ReviewPostFields, { form, updateForm }),
        h(TextAreaField, {
          id: "post-content",
          label: boardType === "idea" ? "본문" : "게임 설명",
          value: form.content,
          onChange: (value) => updateForm("content", value),
          required: true,
          rows: 8,
        }),
        h(TextField, {
          id: "post-tags",
          label: "태그",
          value: form.tags,
          onChange: (value) => updateForm("tags", value),
          placeholder: "쉼표로 구분",
        }),
        h(
          "div",
          { className: "button-row" },
          h(
            "button",
            { className: "primary-button", type: "submit", disabled: loading },
            loading ? "저장 중" : "저장"
          ),
          h("button", { className: "ghost-button", type: "button", onClick: onCancel }, "취소")
        )
      )
    );
  }

  // RAG 미리확인 결과를 글쓰기 흐름 안에서 바로 보여준다.
  function RagRecommendationPanel({ items, feedback, searched, loading, error }) {
    if (!searched) {
      return null;
    }

    const hasFeedback = Boolean(
      feedback && (feedback.summary || feedback.duplicateRisk || feedback.suggestion)
    );

    return h(
      "section",
      { className: "rag-result-box" },
      h("h2", null, "관련 게시글"),
      h(StatusMessage, { error }),
      loading ? h(LoadingState, { title: "관련 게시글을 확인 중입니다.", compact: true }) : null,
      !loading && !error && items.length === 0
        ? h(EmptyState, {
            title: "관련 게시글이 없습니다.",
            description: "제목을 조금 바꿔서 다시 확인할 수 있습니다.",
            compact: true,
          })
        : null,
      items.length > 0
        ? h(
            "ol",
            { className: "rag-result-list" },
            items.map((item) =>
              h(
                "li",
                { key: item.id },
                h("strong", null, item.title),
                h(
                  "span",
                  null,
                  `${BOARDS[item.board_type]?.title || item.board_type} · 유사도 ${Math.round(
                    item.similarity * 100
                  )}%`
                )
              )
            )
          )
        : null,
      hasFeedback
        ? h(
            "div",
            { className: "rag-generated-feedback" },
            feedback.summary ? h(DetailField, { label: "AI 요약", value: feedback.summary }) : null,
            feedback.duplicateRisk
              ? h(DetailField, { label: "중복 가능성", value: feedback.duplicateRisk })
              : null,
            feedback.suggestion ? h(DetailField, { label: "개선 제안", value: feedback.suggestion }) : null
          )
        : null
    );
  }

  // 아이디어 게시글에만 필요한 기획 필드를 그린다.
  function IdeaPostFields({ form, updateForm }) {
    return h(
      React.Fragment,
      null,
      h(TextField, {
        id: "post-genre",
        label: "장르",
        value: form.genre,
        onChange: (value) => updateForm("genre", value),
      }),
      h(TextField, {
        id: "post-core-fun",
        label: "핵심 재미",
        value: form.core_fun,
        onChange: (value) => updateForm("core_fun", value),
      }),
      h(TextField, {
        id: "post-platform",
        label: "예상 플랫폼",
        value: form.platform,
        onChange: (value) => updateForm("platform", value),
      }),
      h(TextField, {
        id: "post-difficulty",
        label: "구현 난이도",
        value: form.difficulty,
        onChange: (value) => updateForm("difficulty", value),
      }),
      h(TextField, {
        id: "post-source-url",
        label: "참고 링크",
        type: "url",
        value: form.source_url,
        onChange: (value) => updateForm("source_url", value),
      })
    );
  }

  // 리뷰 게시글에만 필요한 URL과 미디어 필드를 그린다.
  function ReviewPostFields({ form, updateForm }) {
    return h(
      React.Fragment,
      null,
      h(TextField, {
        id: "post-game-url",
        label: "게임 URL",
        type: "url",
        value: form.source_url,
        onChange: (value) => updateForm("source_url", value),
      }),
      h(TextField, {
        id: "post-video-url",
        label: "영상 URL",
        type: "url",
        value: form.video_url,
        onChange: (value) => updateForm("video_url", value),
      }),
      h(TextField, {
        id: "post-image-url",
        label: "이미지 URL",
        type: "url",
        value: form.image_url,
        onChange: (value) => updateForm("image_url", value),
      }),
      h(TextField, {
        id: "post-genre",
        label: "장르",
        value: form.genre,
        onChange: (value) => updateForm("genre", value),
      }),
      h(TextField, {
        id: "post-platform",
        label: "플랫폼",
        value: form.platform,
        onChange: (value) => updateForm("platform", value),
      })
    );
  }

  // 게시글 상세 화면이다. 본문, 미디어, 댓글과 작성자 전용 수정/삭제를 함께 보여준다.
  function PostDetail({ postId, boardType, user, onBack, onEdit, onDeleted, onRequireLogin }) {
    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState("");

    // 상세 API는 댓글 변경 뒤에도 다시 호출해서 평균 별점과 댓글 수를 최신으로 맞춘다.
    function loadPost() {
      setLoading(true);
      setError("");

      window.PotatoApi.getPost(postId)
        .then((data) => {
          setPost(data);
        })
        .catch((requestError) => {
          if (
            handleProtectedApiError(
              requestError,
              onRequireLogin,
              "로그인 후 게시글을 확인할 수 있습니다."
            )
          ) {
            return;
          }
          setError(requestError.message);
        })
        .finally(() => {
          setLoading(false);
        });
    }

    useEffect(() => {
      loadPost();
    }, [postId]);

    async function deletePost() {
      if (!ensureProtectedAction(user, onRequireLogin, "로그인 후 게시글을 삭제할 수 있습니다.")) {
        return;
      }

      if (!window.confirm("게시글을 삭제할까요?")) {
        return;
      }

      setDeleting(true);
      setError("");

      try {
        await window.PotatoApi.deletePost(post.id);
        onDeleted();
      } catch (requestError) {
        if (
          handleProtectedApiError(
            requestError,
            onRequireLogin,
            "로그인이 만료되었습니다. 다시 로그인하세요."
          )
        ) {
          return;
        }
        setError(requestError.message);
        setDeleting(false);
      }
    }

    if (loading) {
      return h(
        "section",
        { className: "board-shell" },
        h(LoadingState, {
          title: "게시글을 불러오는 중입니다.",
          description: "본문과 댓글 정보를 확인하고 있습니다.",
        })
      );
    }

    if (error || !post) {
      return h(
        "section",
        { className: "board-shell" },
        h("div", { className: "board-title-row" }, h("h1", null, "게시글 상세"), h("button", { className: "ghost-button", type: "button", onClick: onBack }, "목록")),
        h(StatusMessage, { error: error || "게시글을 찾을 수 없습니다." })
      );
    }

    const isOwner = post.author?.id === user?.id;

    return h(
      "section",
      { className: "board-shell" },
      h(
        "div",
        { className: "board-title-row" },
        h("div", null, h("div", { className: "section-eyebrow" }, BOARDS[boardType].title), h("h1", null, post.title)),
        h(
          "div",
          { className: "button-row" },
          h("button", { className: "ghost-button", type: "button", onClick: onBack }, "목록"),
          isOwner ? h("button", { className: "ghost-button", type: "button", onClick: () => onEdit(post) }, "수정") : null,
          isOwner
            ? h(
                "button",
                { className: "danger-button", type: "button", onClick: deletePost, disabled: deleting },
                deleting ? "삭제 중" : "삭제"
              )
            : null
        )
      ),
      h(StatusMessage, { error }),
      h(
        "article",
        { className: "post-detail" },
        h(
          "div",
          { className: "detail-meta" },
          h("span", null, getAuthorName(post.author)),
          h("span", null, formatDate(post.created_at)),
          h("span", null, `댓글 ${post.comment_count || 0}`),
          boardType === "review"
            ? h("span", null, `평균 별점 ${formatRating(post.average_rating)}`)
            : null
        ),
        h(PostDetailFields, { boardType, post }),
        h("p", { className: "post-content" }, post.content),
        h(MediaPreview, { post }),
        h(TagList, { tags: post.tags })
      ),
      boardType === "idea"
        ? h(SimilarGamesPanel, { postId: post.id, user, onRequireLogin })
        : null,
      boardType === "idea"
        ? h(AgentReviewPanel, { postId: post.id, user, onRequireLogin })
        : null,
      h(CommentsSection, { post, boardType, user, onChanged: loadPost, onRequireLogin })
    );
  }

  // 아이디어 상세 화면에서 MCP 유사 게임 결과를 불러와 카드 목록으로 보여준다.
  function SimilarGamesPanel({ postId, user, onRequireLogin }) {
    const [games, setGames] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // MCP 호출은 외부 서버와 RAWG API에 의존하므로 버튼 클릭 때만 실행한다.
    async function loadSimilarGames() {
      if (!ensureProtectedAction(user, onRequireLogin, "로그인 후 비슷한 게임을 조회할 수 있습니다.")) {
        return;
      }

      if (!postId) {
        return;
      }

      setError("");
      setLoading(true);

      try {
        const data = await window.PotatoApi.findSimilarGames({ postId });
        setGames(data?.items || []);
        setLoaded(true);
      } catch (requestError) {
        if (
          handleProtectedApiError(
            requestError,
            onRequireLogin,
            "로그인이 만료되었습니다. 다시 로그인하세요."
          )
        ) {
          return;
        }
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    return h(
      "section",
      { className: "similar-games-panel" },
      h(
        "div",
        { className: "panel-title-row" },
        h("div", null, h("div", { className: "section-eyebrow" }, "MCP"), h("h2", null, "비슷한 기존 게임")),
        h(
          "button",
          {
            className: "ghost-button",
            type: "button",
            onClick: loadSimilarGames,
            disabled: loading || !postId,
          },
          loading ? "조회 중" : loaded ? "다시 조회" : "조회"
        )
      ),
      h(StatusMessage, { error }),
      loading ? h(LoadingState, { title: "비슷한 게임을 찾고 있습니다.", compact: true }) : null,
      loaded && games.length === 0
        ? h(EmptyState, {
            title: "비슷한 게임을 찾지 못했습니다.",
            description: "아이디어의 제목이나 장르를 조금 더 구체적으로 적어 보세요.",
            compact: true,
          })
        : null,
      games.length > 0
        ? h(
            "div",
            { className: "similar-game-grid" },
            games.map((game) =>
              h(
                "article",
                { className: "similar-game-card", key: game.id || game.name },
                game.image_url
                  ? h("img", { className: "similar-game-image", src: game.image_url, alt: game.name })
                  : h("div", { className: "similar-game-image is-empty" }, "No image"),
                h(
                  "div",
                  { className: "similar-game-body" },
                  h("h3", null, game.name),
                  h("p", { className: "muted-text" }, formatGameMeta(game)),
                  h("p", null, formatGameTags(game))
                )
              )
            )
          )
        : null
    );
  }

  // 아이디어 상세 화면에서 Agent 분석을 실행하고 결과를 표시한다.
  function AgentReviewPanel({ postId, user, onRequireLogin }) {
    const [apiKeyInfo, setApiKeyInfo] = useState(null);
    const [loadingKey, setLoadingKey] = useState(false);
    const [review, setReview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // API Key 등록 여부를 먼저 확인해 분석 버튼 상태를 정한다.
    useEffect(() => {
      let ignore = false;
      setLoadingKey(true);

      window.PotatoApi.getApiKey()
        .then((data) => {
          if (!ignore) {
            setApiKeyInfo(data);
          }
        })
        .catch((requestError) => {
          if (!ignore) {
            if (
              handleProtectedApiError(
                requestError,
                onRequireLogin,
                "로그인 후 AI 분석을 사용할 수 있습니다."
              )
            ) {
              return;
            }
            setError(requestError.message);
          }
        })
        .finally(() => {
          if (!ignore) {
            setLoadingKey(false);
          }
        });

      return () => {
        ignore = true;
      };
    }, [postId]);

    // 버튼 클릭 시 Agent 분석 API를 호출하고 응답을 현재 상세 화면에 남긴다.
    async function runAgentReview() {
      if (!ensureProtectedAction(user, onRequireLogin, "로그인 후 AI 분석을 사용할 수 있습니다.")) {
        return;
      }

      setError("");
      setLoading(true);

      try {
        const data = await window.PotatoApi.reviewIdea({ postId });
        setReview(data);
      } catch (requestError) {
        if (
          handleProtectedApiError(
            requestError,
            onRequireLogin,
            "로그인이 만료되었습니다. 다시 로그인하세요."
          )
        ) {
          return;
        }
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    const hasApiKey = Boolean(apiKeyInfo?.has_api_key);

    return h(
      "section",
      { className: "agent-review-panel" },
      h(
        "div",
        { className: "panel-title-row" },
        h("div", null, h("div", { className: "section-eyebrow" }, "Agent"), h("h2", null, "AI 아이디어 분석")),
        h(
          "button",
          {
            className: "primary-button",
            type: "button",
            onClick: runAgentReview,
            disabled: loading || loadingKey || !hasApiKey || !postId,
          },
          loading ? "분석 중" : review ? "다시 분석" : "AI 분석"
        )
      ),
      h(StatusMessage, { error }),
      loadingKey ? h(LoadingState, { title: "API Key 상태를 확인 중입니다.", compact: true }) : null,
      !loadingKey && apiKeyInfo && !hasApiKey
        ? h(EmptyState, {
            title: "OpenAI API Key가 필요합니다.",
            description: "마이페이지에서 API Key를 등록하면 AI 분석을 실행할 수 있습니다.",
            compact: true,
          })
        : null,
      loading ? h(LoadingState, { title: "AI가 아이디어를 분석하고 있습니다.", compact: true }) : null,
      review ? h(AgentReviewResult, { review }) : null
    );
  }

  // Agent 분석 응답을 요약, 차별점, 난이도, 개선 제안으로 나누어 보여준다.
  function AgentReviewResult({ review }) {
    return h(
      "div",
      { className: "agent-result-grid" },
      h(DetailField, { label: "한 줄 요약", value: review.summary }),
      h(DetailField, { label: "차별점", value: review.difference }),
      h(DetailField, { label: "구현 난이도", value: review.difficulty }),
      h(
        "div",
        { className: "detail-field agent-suggestions" },
        h("dt", null, "개선 제안"),
        h(
          "dd",
          null,
          h(
            "ol",
            null,
            (review.suggestions || []).map((suggestion) => h("li", { key: suggestion }, suggestion))
          )
        )
      )
    );
  }

  // 상세 화면에서 게시판별 추가 필드를 같은 모양으로 보여준다.
  function PostDetailFields({ boardType, post }) {
    const videoUrl = findMediaUrl(post, "video_url");
    const imageUrl = findMediaUrl(post, "image_url");

    return h(
      "dl",
      { className: "detail-grid" },
      h(DetailField, { label: "장르", value: post.genre }),
      h(DetailField, { label: boardType === "idea" ? "예상 플랫폼" : "플랫폼", value: post.platform }),
      boardType === "idea"
        ? h(React.Fragment, null, h(DetailField, { label: "핵심 재미", value: post.core_fun }), h(DetailField, { label: "구현 난이도", value: post.difficulty }), h(DetailField, { label: "참고 링크", value: post.source_url, link: true }))
        : h(React.Fragment, null, h(DetailField, { label: "게임 URL", value: post.source_url, link: true }), h(DetailField, { label: "영상 URL", value: videoUrl, link: true }), h(DetailField, { label: "이미지 URL", value: imageUrl, link: true }))
    );
  }

  // 상세 필드 하나를 비어 있는 값까지 일정하게 표시한다.
  function DetailField({ label, value, link = false }) {
    return h(
      "div",
      { className: "detail-field" },
      h("dt", null, label),
      h(
        "dd",
        null,
        value
          ? link
            ? h("a", { href: value, target: "_blank", rel: "noreferrer" }, value)
            : value
          : "-"
      )
    );
  }

  // 리뷰 게시글의 이미지와 URL 미디어를 상세 화면에서 확인할 수 있게 모아 보여준다.
  function MediaPreview({ post }) {
    const mediaItems = post.media || [];
    if (mediaItems.length === 0) {
      return null;
    }

    return h(
      "div",
      { className: "media-list" },
      mediaItems.map((mediaItem) =>
        mediaItem.media_type === "image_url"
          ? h(
              "figure",
              { className: "media-preview", key: mediaItem.id },
              h("img", { src: mediaItem.thumbnail_url || mediaItem.url, alt: "게임 이미지" }),
              h("figcaption", null, "이미지")
            )
          : h(
              "a",
              {
                className: "media-link",
                key: mediaItem.id,
                href: mediaItem.url,
                target: "_blank",
                rel: "noreferrer",
              },
              mediaItem.media_type === "video_url" ? "영상 URL" : "게임 URL"
            )
      )
    );
  }

  // 상세 화면 댓글 영역이다. 리뷰 게시판은 별점과 세부 리뷰 필드를 함께 입력한다.
  function CommentsSection({ post, boardType, user, onChanged, onRequireLogin }) {
    return h(
      "section",
      { className: "comments-panel" },
      h(
        "div",
        { className: "section-header" },
        h("div", null, h("div", { className: "section-eyebrow" }, "댓글"), h("h2", null, `댓글 ${post.comments?.length || 0}개`))
      ),
      h(CommentForm, {
        boardType,
        user,
        submitLabel: boardType === "review" ? "리뷰 남기기" : "댓글 남기기",
        onSubmit: async (payload) => {
          await window.PotatoApi.createComment(post.id, payload);
          onChanged();
        },
        onRequireLogin,
      }),
      post.comments?.length
        ? h(
            "ul",
            { className: "comment-list" },
            post.comments.map((comment) =>
              h(CommentItem, {
                key: comment.id,
                boardType,
                comment,
                canEdit: comment.author?.id === user?.id,
                onChanged,
                user,
                onRequireLogin,
              })
            )
          )
        : h(EmptyState, {
            title: "아직 댓글이 없습니다.",
            description: "첫 피드백을 남겨 보세요.",
            compact: true,
            className: "comments-empty",
          })
    );
  }

  // 댓글 작성과 수정에서 같은 입력 필드를 재사용한다.
  function CommentForm({
    boardType,
    initialComment,
    submitLabel,
    onSubmit,
    onCancel,
    user,
    onRequireLogin,
  }) {
    const [content, setContent] = useState(initialComment?.content || "");
    const [rating, setRating] = useState(initialComment?.rating ? String(initialComment.rating) : "5");
    const [goodPoint, setGoodPoint] = useState(initialComment?.good_point || "");
    const [badPoint, setBadPoint] = useState(initialComment?.bad_point || "");
    const [suggestion, setSuggestion] = useState(initialComment?.suggestion || "");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // 리뷰 게시판에서는 별점/장단점/제안을 포함하고, 아이디어 게시판은 본문만 보낸다.
    async function submit(event) {
      event.preventDefault();
      if (!ensureProtectedAction(user, onRequireLogin, "로그인 후 댓글을 작성할 수 있습니다.")) {
        return;
      }

      setError("");
      setLoading(true);

      try {
        const payload = { content: content.trim() };
        if (boardType === "review") {
          payload.rating = Number(rating);
          payload.good_point = cleanOptionalValue(goodPoint);
          payload.bad_point = cleanOptionalValue(badPoint);
          payload.suggestion = cleanOptionalValue(suggestion);
        }

        await onSubmit(payload);
        if (!initialComment) {
          setContent("");
          setRating("5");
          setGoodPoint("");
          setBadPoint("");
          setSuggestion("");
        }
      } catch (requestError) {
        if (
          handleProtectedApiError(
            requestError,
            onRequireLogin,
            "로그인이 만료되었습니다. 다시 로그인하세요."
          )
        ) {
          return;
        }
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    return h(
      "form",
      { className: "comment-form", onSubmit: submit },
      h(StatusMessage, { error }),
      boardType === "review"
        ? h(SelectField, {
            id: initialComment ? `edit-rating-${initialComment.id}` : "comment-rating",
            label: "별점",
            value: rating,
            onChange: setRating,
            options: [
              { value: "5", label: "5" },
              { value: "4", label: "4" },
              { value: "3", label: "3" },
              { value: "2", label: "2" },
              { value: "1", label: "1" },
            ],
          })
        : null,
      h(TextAreaField, {
        id: initialComment ? `edit-comment-${initialComment.id}` : "comment-content",
        label: boardType === "review" ? "리뷰 본문" : "댓글",
        value: content,
        onChange: setContent,
        required: true,
        rows: 4,
      }),
      boardType === "review"
        ? h(
            "div",
            { className: "review-comment-grid" },
            h(TextField, {
              id: initialComment ? `edit-good-${initialComment.id}` : "comment-good",
              label: "좋았던 점",
              value: goodPoint,
              onChange: setGoodPoint,
            }),
            h(TextField, {
              id: initialComment ? `edit-bad-${initialComment.id}` : "comment-bad",
              label: "아쉬운 점",
              value: badPoint,
              onChange: setBadPoint,
            }),
            h(TextField, {
              id: initialComment ? `edit-suggestion-${initialComment.id}` : "comment-suggestion",
              label: "개선 제안",
              value: suggestion,
              onChange: setSuggestion,
            })
          )
        : null,
      h(
        "div",
        { className: "button-row" },
        h(
          "button",
          { className: "primary-button", type: "submit", disabled: loading },
          loading ? "저장 중" : submitLabel
        ),
        onCancel ? h("button", { className: "ghost-button", type: "button", onClick: onCancel }, "취소") : null
      )
    );
  }

  // 댓글 한 건을 표시하고, 작성자에게만 수정/삭제 UI를 연다.
  function CommentItem({ boardType, comment, canEdit, onChanged, user, onRequireLogin }) {
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState("");
    const [deleting, setDeleting] = useState(false);

    async function deleteComment() {
      if (!ensureProtectedAction(user, onRequireLogin, "로그인 후 댓글을 삭제할 수 있습니다.")) {
        return;
      }

      if (!window.confirm("댓글을 삭제할까요?")) {
        return;
      }

      setDeleting(true);
      setError("");

      try {
        await window.PotatoApi.deleteComment(comment.id);
        onChanged();
      } catch (requestError) {
        if (
          handleProtectedApiError(
            requestError,
            onRequireLogin,
            "로그인이 만료되었습니다. 다시 로그인하세요."
          )
        ) {
          return;
        }
        setError(requestError.message);
        setDeleting(false);
      }
    }

    if (editing) {
      return h(
        "li",
        { className: "comment-item" },
        h(CommentForm, {
          boardType,
          initialComment: comment,
          submitLabel: "댓글 수정",
          onSubmit: async (payload) => {
            await window.PotatoApi.updateComment(comment.id, payload);
            setEditing(false);
            onChanged();
          },
          onCancel: () => setEditing(false),
          user,
          onRequireLogin,
        })
      );
    }

    return h(
      "li",
      { className: "comment-item" },
      h(StatusMessage, { error }),
      h(
        "div",
        { className: "comment-head" },
        h("strong", null, getAuthorName(comment.author)),
        h("span", null, formatDate(comment.created_at)),
        comment.rating ? h("span", null, `별점 ${comment.rating}`) : null
      ),
      h("p", null, comment.content),
      boardType === "review"
        ? h(
            "dl",
            { className: "comment-review-grid" },
            h(DetailField, { label: "좋았던 점", value: comment.good_point }),
            h(DetailField, { label: "아쉬운 점", value: comment.bad_point }),
            h(DetailField, { label: "개선 제안", value: comment.suggestion })
          )
        : null,
      canEdit
        ? h(
            "div",
            { className: "button-row" },
            h("button", { className: "ghost-button", type: "button", onClick: () => setEditing(true) }, "수정"),
            h(
              "button",
              { className: "danger-button", type: "button", onClick: deleteComment, disabled: deleting },
              deleting ? "삭제 중" : "삭제"
            )
          )
        : null
    );
  }

  // 태그 배열을 작고 일정한 배지 목록으로 표시한다.
  function TagList({ tags }) {
    if (!tags || tags.length === 0) {
      return null;
    }

    return h(
      "div",
      { className: "tag-list" },
      tags.map((tag) => h("span", { className: "tag-chip", key: tag }, `#${tag}`))
    );
  }

  function buildPostFormState(post) {
    return {
      title: post?.title || "",
      content: post?.content || "",
      genre: post?.genre || "",
      core_fun: post?.core_fun || "",
      platform: post?.platform || "",
      difficulty: post?.difficulty || "",
      tags: post?.tags ? post.tags.join(", ") : "",
      source_url: post?.source_url || findMediaUrl(post, "game_url") || "",
      video_url: findMediaUrl(post, "video_url") || "",
      image_url: findMediaUrl(post, "image_url") || "",
    };
  }

  function buildPostPayload(boardType, form) {
    const payload = {
      board_type: boardType,
      title: form.title.trim(),
      content: form.content.trim(),
      genre: cleanOptionalValue(form.genre),
      platform: cleanOptionalValue(form.platform),
      tags: splitTags(form.tags),
    };

    if (boardType === "idea") {
      payload.core_fun = cleanOptionalValue(form.core_fun);
      payload.difficulty = cleanOptionalValue(form.difficulty);
      payload.source_url = cleanOptionalValue(form.source_url);
      return payload;
    }

    payload.source_url = cleanOptionalValue(form.source_url);
    payload.video_url = cleanOptionalValue(form.video_url);
    payload.image_url = cleanOptionalValue(form.image_url);
    return payload;
  }

  function removeBoardType(payload) {
    const nextPayload = { ...payload };
    delete nextPayload.board_type;
    return nextPayload;
  }

  function cleanOptionalValue(value) {
    const cleanedValue = value.trim();
    return cleanedValue || null;
  }

  function splitTags(value) {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function findMediaUrl(post, mediaType) {
    const mediaItem = post?.media?.find((item) => item.media_type === mediaType);
    return mediaItem?.url || "";
  }

  function truncateText(value, maxLength) {
    if (!value) {
      return "";
    }

    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength)}...`;
  }

  function getAuthorName(author) {
    return author?.nickname || "익명";
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  function formatRating(value) {
    return value ? Number(value).toFixed(1) : "-";
  }

  // 게임 카드에 들어갈 출시일/평점/플랫폼 요약 문자열을 만든다.
  function formatGameMeta(game) {
    const parts = [];
    if (game.released) {
      parts.push(game.released);
    }
    if (game.rating !== null && game.rating !== undefined) {
      parts.push(`평점 ${game.rating}`);
    }
    if (game.metacritic !== null && game.metacritic !== undefined) {
      parts.push(`메타 ${game.metacritic}`);
    }
    if (Array.isArray(game.platforms) && game.platforms.length > 0) {
      parts.push(game.platforms.slice(0, 3).join(", "));
    }

    return parts.join(" · ") || "세부 정보 없음";
  }

  // 장르가 많을 수 있어 카드에서는 앞쪽 몇 개만 표시한다.
  function formatGameTags(game) {
    if (!Array.isArray(game.genres) || game.genres.length === 0) {
      return "장르 정보 없음";
    }

    return game.genres.slice(0, 4).join(", ");
  }

  // React state 화면 전환을 브라우저 history에 남길 때 쓰는 게시판 경로 상태다.
  function buildBoardHistoryState(selectedBoard, route) {
    return {
      potato_board_route: true,
      selectedBoard,
      boardView: route.boardView || "list",
      selectedPostId: route.selectedPostId || null,
      editingPost: route.editingPost || null,
    };
  }

  function isBoardHistoryState(state) {
    return Boolean(state?.potato_board_route);
  }

  function pushBrowserHistory(route, latestRouteRef) {
    if (isSameBoardRoute(latestRouteRef.current, route)) {
      return;
    }

    writeBrowserHistory("pushState", route, latestRouteRef);
  }

  function replaceBrowserHistory(route, latestRouteRef) {
    writeBrowserHistory("replaceState", route, latestRouteRef);
  }

  function writeBrowserHistory(methodName, route, latestRouteRef) {
    if (!window.history?.[methodName]) {
      return;
    }

    try {
      window.history[methodName](route, "", window.location.href);
      if (latestRouteRef) {
        latestRouteRef.current = route;
      }
    } catch (error) {
      // history state 저장 실패는 화면 전환 자체를 막지 않는다.
    }
  }

  function isSameBoardRoute(leftRoute, rightRoute) {
    if (!leftRoute || !rightRoute) {
      return false;
    }

    return (
      leftRoute.selectedBoard === rightRoute.selectedBoard &&
      leftRoute.boardView === rightRoute.boardView &&
      leftRoute.selectedPostId === rightRoute.selectedPostId &&
      getEditingPostId(leftRoute.editingPost) === getEditingPostId(rightRoute.editingPost)
    );
  }

  function getEditingPostId(post) {
    return post?.id || null;
  }

  // 보호된 버튼 동작을 시작하기 전에 로그인 세션이 남아 있는지 먼저 확인한다.
  function ensureProtectedAction(user, onRequireLogin, message) {
    if (user && window.PotatoApi.getToken()) {
      return true;
    }

    if (onRequireLogin) {
      onRequireLogin(message);
    }
    return false;
  }

  // API 호출 뒤 인증 만료가 확인되면 로컬 오류 대신 로그인 안내 흐름으로 넘긴다.
  function handleProtectedApiError(error, onRequireLogin, message) {
    if (!window.PotatoApi.isUnauthorizedError(error)) {
      return false;
    }

    if (onRequireLogin) {
      onRequireLogin(message);
    }
    return true;
  }

  // 여러 인증/설정 화면에서 같은 입력 스타일과 제어 방식을 쓰기 위한 공통 필드다.
  function TextField({
    id,
    label,
    value,
    onChange,
    type = "text",
    placeholder = "",
    required = false,
    minLength,
    autoComplete,
    autoFocus = false,
    inputMode,
  }) {
    return h(
      "label",
      { className: "field", htmlFor: id },
      h("span", null, label),
      h("input", {
        id,
        type,
        value,
        placeholder,
        required,
        minLength,
        autoComplete,
        autoFocus,
        inputMode,
        onChange: (event) => onChange(event.target.value),
      })
    );
  }

  // 긴 본문과 댓글을 입력하는 공통 textarea 필드다.
  function TextAreaField({ id, label, value, onChange, placeholder = "", required = false, rows = 5 }) {
    return h(
      "label",
      { className: "field", htmlFor: id },
      h("span", null, label),
      h("textarea", {
        id,
        value,
        placeholder,
        required,
        rows,
        onChange: (event) => onChange(event.target.value),
      })
    );
  }

  // 정해진 값 중 하나를 고르는 공통 select 필드다.
  function SelectField({ id, label, value, onChange, options }) {
    return h(
      "label",
      { className: "field", htmlFor: id },
      h("span", null, label),
      h(
        "select",
        {
          id,
          value,
          onChange: (event) => onChange(event.target.value),
        },
        options.map((option) => h("option", { key: option.value, value: option.value }, option.label))
      )
    );
  }

  // 수정하면 안 되는 계정 정보를 입력창처럼 보이되 읽기 전용으로 표시한다.
  function ReadOnlyField({ label, value }) {
    return h(
      "div",
      { className: "field read-only-field" },
      h("span", null, label),
      h("strong", null, value || "-")
    );
  }

  // API 성공/실패 피드백을 같은 위치와 스타일로 보여준다.
  function StatusMessage({ error, success }) {
    if (!error && !success) {
      return null;
    }

    return h(
      "p",
      {
        className: error ? "status-message is-error" : "status-message is-success",
        role: error ? "alert" : "status",
      },
      error || success
    );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
})();
