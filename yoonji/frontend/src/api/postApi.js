import axiosInstance from "./axiosInstance";


export async function getPosts(params = {}) {
  const response = await axiosInstance.get("/posts", { params });
  return response.data;
}


export async function getPost(postId) {
  const response = await axiosInstance.get(`/posts/${postId}`);
  return response.data;
}
