import axiosInstance from "./axiosInstance";


export async function getMe() {
  const response = await axiosInstance.get("/users/me");
  return response.data;
}
