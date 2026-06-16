import axiosInstance from "./axiosInstance";


export async function signup(payload) {
  const response = await axiosInstance.post("/auth/signup", payload);
  return response.data;
}


export async function login(payload) {
  const response = await axiosInstance.post("/auth/login", payload);
  return response.data;
}


export async function refreshToken(payload) {
  const response = await axiosInstance.post("/auth/refresh", payload);
  return response.data;
}


export async function logout(payload) {
  await axiosInstance.post("/auth/logout", payload);
}
