import { useRef, useState } from "react";

import { API_BASE_URL } from "../../api/client";
import { deleteImage, uploadImage } from "../../api/imageApi";
import { getApiErrorMessage } from "../../hooks/usePosts";


function ImageUploader({ disabled = false, onChange, value = [] }) {
  const fileInputRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(event) {
    const files = Array.from(event.target.files || []);

    if (files.length === 0) {
      return;
    }

    setIsUploading(true);
    setErrorMessage("");

    try {
      const uploadedImages = [];

      for (const file of files) {
        const image = await uploadImage(file);
        uploadedImages.push(image);
      }

      onChange([...value, ...uploadedImages]);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleRemove(image) {
    setErrorMessage("");

    if (image.status === "TEMP") {
      try {
        await deleteImage(image.id);
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
        return;
      }
    }

    onChange(value.filter((item) => item.id !== image.id));
  }

  return (
    <section className="image-uploader" aria-labelledby="image-uploader-title">
      <div className="image-uploader-heading">
        <div>
          <h3 id="image-uploader-title">이미지</h3>
          <p>JPEG, PNG, WEBP 파일을 5MB 이하로 업로드할 수 있습니다.</p>
        </div>
        <label className="file-button">
          이미지 선택
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={disabled || isUploading}
            onChange={handleFileChange}
          />
        </label>
      </div>

      {isUploading && <p className="empty-text">이미지를 업로드하는 중입니다.</p>}
      {errorMessage && <p className="form-message error">{errorMessage}</p>}

      {value.length > 0 && (
        <div className="image-preview-grid" aria-label="uploaded images">
          {value.map((image) => (
            <article key={image.id} className="image-preview-card">
              <img
                src={resolveMediaUrl(image.thumbnail_url || image.file_url)}
                alt={image.original_name || ""}
              />
              <div>
                <strong>{image.original_name || `image-${image.id}`}</strong>
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled || isUploading}
                  onClick={() => handleRemove(image)}
                >
                  제거
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}


function resolveMediaUrl(url) {
  if (!url || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${apiOrigin}${url}`;
}


export default ImageUploader;
