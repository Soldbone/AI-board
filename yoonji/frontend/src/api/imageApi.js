import axiosInstance from "./axiosInstance";


export async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await axiosInstance.post("/images", formData);
  return response.data;
}


export async function deleteImage(imageId) {
  await axiosInstance.delete(`/images/${imageId}`);
}
