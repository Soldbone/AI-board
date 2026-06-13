import axiosInstance from "./axiosInstance";


export async function getPosts(params = {}) {
  const response = await axiosInstance.get("/posts", { params });
  return response.data;
}


export async function getPost(postId) {
  const response = await axiosInstance.get(`/posts/${postId}`);
  return response.data;
}


export async function getSimilarPosts(postId, limit = 3) {
  const response = await axiosInstance.get(`/posts/${postId}/similar-posts`, {
    params: { limit },
  });
  return response.data;
}


export async function createPost(payload) {
  const response = await axiosInstance.post("/posts", payload);
  return response.data;
}


export async function updatePost(postId, payload) {
  const response = await axiosInstance.patch(`/posts/${postId}`, payload);
  return response.data;
}


export async function deletePost(postId) {
  await axiosInstance.delete(`/posts/${postId}`);
}
