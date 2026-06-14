import axiosInstance from "./axiosInstance";


export async function requestQuestionReferenceAnswer(postId, payload = {}) {
  const response = await axiosInstance.post(
    `/posts/${postId}/ai/reference-answer`,
    {
      top_k: payload.top_k ?? payload.topK ?? 5,
    },
  );
  return response.data;
}


export async function requestPurchaseSummary(postId, payload = {}) {
  const response = await axiosInstance.post(
    `/posts/${postId}/ai/purchase-summary`,
    {
      top_k: payload.top_k ?? payload.topK ?? 5,
      include_similar_price_range:
        payload.include_similar_price_range ??
        payload.includeSimilarPriceRange ??
        true,
    },
  );
  return response.data;
}


export async function getAiOutput(aiOutputId) {
  const response = await axiosInstance.get(`/ai/outputs/${aiOutputId}`);
  return response.data;
}
