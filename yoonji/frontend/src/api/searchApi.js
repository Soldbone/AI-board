import axiosInstance from "./axiosInstance";


export async function searchPosts(params = {}) {
  const response = await axiosInstance.get("/search/posts", { params });
  return response.data;
}
