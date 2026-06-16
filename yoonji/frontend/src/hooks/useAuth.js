import { useCallback, useEffect, useState } from "react";

import {
  login as loginRequest,
  logout as logoutRequest,
  refreshToken as refreshTokenRequest,
  signup as signupRequest,
} from "../api/authApi";
import { getMe } from "../api/userApi";


const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";


function getApiErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.detail ||
    error?.message ||
    "요청 처리 중 오류가 발생했습니다."
  );
}


function saveTokens({ accessToken, refreshToken }) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}


function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}


export function useAuth() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() =>
    localStorage.getItem(ACCESS_TOKEN_KEY) ? "loading" : "anonymous",
  );
  const [errorMessage, setErrorMessage] = useState("");

  const loadMe = useCallback(async () => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);

    if (!accessToken) {
      setUser(null);
      setStatus("anonymous");
      return null;
    }

    setStatus("loading");

    try {
      const currentUser = await getMe();
      setUser(currentUser);
      setStatus("authenticated");
      setErrorMessage("");
      return currentUser;
    } catch (error) {
      clearTokens();
      setUser(null);
      setStatus("anonymous");
      setErrorMessage(getApiErrorMessage(error));
      return null;
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const signup = useCallback(async (payload) => {
    try {
      setErrorMessage("");
      return await signupRequest(payload);
    } catch (error) {
      const message = getApiErrorMessage(error);
      setErrorMessage(message);
      throw new Error(message);
    }
  }, []);

  const login = useCallback(async (payload) => {
    try {
      setErrorMessage("");
      const data = await loginRequest(payload);

      saveTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      setUser(data.user);
      setStatus("authenticated");
      return data;
    } catch (error) {
      const message = getApiErrorMessage(error);
      setErrorMessage(message);
      throw new Error(message);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (!refreshToken) {
      clearTokens();
      setUser(null);
      setStatus("anonymous");
      return null;
    }

    try {
      const data = await refreshTokenRequest({ refresh_token: refreshToken });
      saveTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      setErrorMessage("");
      return data;
    } catch (error) {
      clearTokens();
      setUser(null);
      setStatus("anonymous");
      setErrorMessage(getApiErrorMessage(error));
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    try {
      if (refreshToken) {
        await logoutRequest({ refresh_token: refreshToken });
      }
    } finally {
      clearTokens();
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  return {
    errorMessage,
    isAuthenticated: status === "authenticated",
    loadMe,
    login,
    logout,
    refreshSession,
    signup,
    status,
    user,
  };
}
