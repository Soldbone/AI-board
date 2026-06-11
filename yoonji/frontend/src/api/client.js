import axiosInstance, { API_BASE_URL } from "./axiosInstance";


export { API_BASE_URL };


export async function healthCheck() {
  const response = await axiosInstance.get("/health");
  return response.data;
}
