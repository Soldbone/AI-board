import axiosInstance from "./axiosInstance";


export async function getBoards() {
  const response = await axiosInstance.get("/boards");
  return response.data;
}


export async function getBoard(boardCode) {
  const response = await axiosInstance.get(`/boards/${boardCode}`);
  return response.data;
}
