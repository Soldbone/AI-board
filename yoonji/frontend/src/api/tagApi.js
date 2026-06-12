import axiosInstance from "./axiosInstance";


export async function getTags(params = {}) {
  const response = await axiosInstance.get("/tags", { params });
  return response.data;
}


export async function createTag(payload) {
  const response = await axiosInstance.post("/tags", payload);
  return response.data;
}
