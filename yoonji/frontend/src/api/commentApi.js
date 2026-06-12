import axiosInstance from "./axiosInstance";


export async function getComments(postId, params = {}) {
  const response = await axiosInstance.get(`/posts/${postId}/comments`, {
    params,
  });
  return response.data;
}


export async function createComment(postId, payload) {
  const response = await axiosInstance.post(`/posts/${postId}/comments`, payload);
  return response.data;
}


export async function updateComment(commentId, payload) {
  const response = await axiosInstance.patch(`/comments/${commentId}`, payload);
  return response.data;
}


export async function deleteComment(commentId) {
  await axiosInstance.delete(`/comments/${commentId}`);
}
