import axiosInstance from "./axiosInstance";


export async function getMe() {
  const response = await axiosInstance.get("/users/me");
  return response.data;
}


export async function getMyPosts(params = {}) {
  const response = await axiosInstance.get("/users/me/posts", { params });
  return response.data;
}


export async function getMyComments(params = {}) {
  const response = await axiosInstance.get("/users/me/comments", { params });
  return response.data;
}
