import axiosInstance from "./axiosInstance";


export async function getProductEnrichment(postId) {
  const response = await axiosInstance.get(`/posts/${postId}/product-enrichment`);
  return response.data;
}


export async function requestProductEnrichment(postId) {
  const response = await axiosInstance.post(`/posts/${postId}/product-enrichment`);
  return response.data;
}
