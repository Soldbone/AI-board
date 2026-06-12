(function () {
  // 프론트 전체에서 공유하는 API 클라이언트다.
  // 토큰 저장, JSON 처리, 인증 헤더 추가를 한곳에서 맡는다.
  const TOKEN_KEY = "potato_access_token";
  const USER_KEY = "potato_current_user";
  const BASE_URL_KEY = "potato_api_base_url";
  const DEFAULT_BASE_URL = "http://localhost:8000";

  // 개발 중 API 서버 주소를 localStorage로 바꿀 수 있게 열어 둔다.
  function getApiBaseUrl() {
    const savedBaseUrl = window.localStorage.getItem(BASE_URL_KEY);
    return (savedBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  function getToken() {
    return window.localStorage.getItem(TOKEN_KEY);
  }

  // 새로고침 뒤에도 로그인 UI를 유지하기 위해 저장된 사용자 정보를 복원한다.
  function getStoredUser() {
    const rawUser = window.localStorage.getItem(USER_KEY);
    if (!rawUser) {
      return null;
    }

    try {
      return JSON.parse(rawUser);
    } catch (error) {
      window.localStorage.removeItem(USER_KEY);
      return null;
    }
  }

  // 로그인/회원가입 완료 뒤 access token과 화면 표시용 사용자 정보를 함께 저장한다.
  function saveSession(accessToken, user) {
    window.localStorage.setItem(TOKEN_KEY, accessToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  // 로그아웃이나 인증 만료 시 클라이언트 세션만 확실히 정리한다.
  function clearSession() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  }

  // FastAPI 응답이 비어 있거나 JSON이 아닐 때도 화면에서 다룰 수 있는 형태로 맞춘다.
  async function parseResponse(response) {
    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return { message: text };
    }
  }

  // FastAPI 기본 에러 형식과 Pydantic 검증 에러를 화면 메시지로 바꾼다.
  function getErrorMessage(data) {
    if (typeof data?.detail === "string") {
      return data.detail;
    }

    if (Array.isArray(data?.detail)) {
      return data.detail.map((item) => item.msg || "입력값을 확인하세요.").join(" ");
    }

    return data?.message || "요청을 처리하지 못했습니다.";
  }

  // 화면에서 인증 만료와 일반 실패를 구분할 수 있도록 Error에 응답 정보를 붙인다.
  function createApiError(response, data) {
    const error = new Error(getErrorMessage(data));
    error.status = response.status;
    error.data = data;
    return error;
  }

  function isUnauthorizedError(error) {
    return error?.status === 401 || error?.status === 403;
  }

  // 모든 API 요청의 공통 통로다. JSON body와 Bearer 토큰 헤더를 자동으로 붙인다.
  async function request(path, options = {}) {
    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };
    const token = getToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const fetchOptions = {
      method: options.method || "GET",
      headers,
    };

    if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await window.fetch(`${getApiBaseUrl()}${path}`, fetchOptions);
    } catch (error) {
      throw new Error("API 서버에 연결할 수 없습니다.");
    }

    const data = await parseResponse(response);

    if (!response.ok) {
      throw createApiError(response, data);
    }

    return data;
  }

  // 화면 컴포넌트가 백엔드 경로를 직접 알지 않도록 기능별 함수로 감싼다.
  window.PotatoApi = {
    getApiBaseUrl,
    getToken,
    getStoredUser,
    saveSession,
    clearSession,
    isUnauthorizedError,
    requestCode({ email, password }) {
      return request("/auth/register/request-code", {
        method: "POST",
        body: { email, password },
      });
    },
    verifyRegister({ email, code }) {
      return request("/auth/register/verify", {
        method: "POST",
        body: { email, code },
      });
    },
    login({ email, password }) {
      return request("/auth/login", {
        method: "POST",
        body: { email, password },
      });
    },
    logout() {
      return request("/auth/logout", { method: "POST" });
    },
    me() {
      return request("/auth/me");
    },
    updateNickname({ nickname }) {
      return request("/users/me/nickname", {
        method: "PATCH",
        body: { nickname },
      });
    },
    deleteMe() {
      return request("/users/me", { method: "DELETE" });
    },
    getApiKey() {
      return request("/users/me/api-key");
    },
    saveApiKey({ apiKey }) {
      return request("/users/me/api-key", {
        method: "PUT",
        body: { provider: "openai", api_key: apiKey },
      });
    },
    deleteApiKey() {
      return request("/users/me/api-key", { method: "DELETE" });
    },
    listPosts({ boardType, search, page = 1, pageSize = 10 }) {
      const params = new URLSearchParams();
      if (boardType) {
        params.set("board_type", boardType);
      }
      if (search) {
        params.set("search", search);
      }
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      return request(`/posts?${params.toString()}`);
    },
    createPost(payload) {
      return request("/posts", {
        method: "POST",
        body: payload,
      });
    },
    getPost(postId) {
      return request(`/posts/${postId}`);
    },
    updatePost(postId, payload) {
      return request(`/posts/${postId}`, {
        method: "PATCH",
        body: payload,
      });
    },
    deletePost(postId) {
      return request(`/posts/${postId}`, { method: "DELETE" });
    },
    createComment(postId, payload) {
      return request(`/posts/${postId}/comments`, {
        method: "POST",
        body: payload,
      });
    },
    updateComment(commentId, payload) {
      return request(`/comments/${commentId}`, {
        method: "PATCH",
        body: payload,
      });
    },
    deleteComment(commentId) {
      return request(`/comments/${commentId}`, { method: "DELETE" });
    },
    recommendPostsByTitle({ title }) {
      return request("/ai/rag/recommend-posts", {
        method: "POST",
        body: { title },
      });
    },
    findSimilarGames({ postId }) {
      return request("/ai/mcp/similar-games", {
        method: "POST",
        body: { post_id: postId },
      });
    },
    reviewIdea({ postId }) {
      return request("/ai/agent/review-idea", {
        method: "POST",
        body: { post_id: postId },
      });
    },
  };
})();
