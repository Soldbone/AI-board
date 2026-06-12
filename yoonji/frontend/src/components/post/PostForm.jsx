import { useEffect, useMemo, useState } from "react";

import FigureInfoForm from "./FigureInfoForm";
import ImageUploader from "./ImageUploader";


const WRITABLE_BOARD_CODES = ["REVIEW", "INFO", "QUESTION", "PURCHASE_HELP"];

const EMPTY_FIGURE_INFO = {
  figure_name: "",
  manufacturer: "",
  figure_type: "",
  price_amount: "",
  price_range: "",
  purchase_date: "",
  satisfaction_score: "",
};


function PostForm({
  boards = [],
  initialBoardCode = "",
  initialPost = null,
  isSubmitting = false,
  mode = "create",
  onCancel,
  onSubmit,
}) {
  const writableBoards = useMemo(
    () => boards.filter((board) => WRITABLE_BOARD_CODES.includes(board.code)),
    [boards],
  );
  const isEditMode = mode === "edit";
  const [boardCode, setBoardCode] = useState(initialPost?.board?.code || "");
  const [title, setTitle] = useState(initialPost?.title || "");
  const [content, setContent] = useState(initialPost?.content || "");
  const [figureInfo, setFigureInfo] = useState(() =>
    buildInitialFigureInfo(initialPost),
  );
  const [images, setImages] = useState(() => initialPost?.images || []);

  useEffect(() => {
    if (!initialPost) {
      return;
    }

    setBoardCode(initialPost.board.code);
    setTitle(initialPost.title);
    setContent(initialPost.content);
    setFigureInfo(buildInitialFigureInfo(initialPost));
    setImages(initialPost.images || []);
  }, [initialPost]);

  useEffect(() => {
    if (isEditMode || boardCode || writableBoards.length === 0) {
      return;
    }

    const initialBoard = writableBoards.find(
      (board) => board.code === initialBoardCode,
    );

    setBoardCode(initialBoard?.code || writableBoards[0].code);
  }, [boardCode, initialBoardCode, isEditMode, writableBoards]);

  const selectedBoard = writableBoards.find((board) => board.code === boardCode);
  const isReviewBoard = boardCode === "REVIEW";

  function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      title,
      content,
    };

    if (!isEditMode) {
      payload.board_code = boardCode;
      payload.status = "PUBLISHED";
    }

    if (isReviewBoard) {
      payload.figure_info = buildFigureInfoPayload(figureInfo);
    }

    payload.image_ids = images.map((image) => image.id);

    onSubmit(payload);
  }

  return (
    <form className="post-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          게시판
          {isEditMode ? (
            <input
              type="text"
              value={selectedBoard?.name || boardCode}
              disabled
              readOnly
            />
          ) : (
            <select
              value={boardCode}
              onChange={(event) => setBoardCode(event.target.value)}
              required
            >
              <option value="">게시판 선택</option>
              {writableBoards.map((board) => (
                <option key={board.id} value={board.code}>
                  {board.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label>
          제목 *
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
            placeholder="제목을 입력하세요"
          />
        </label>

        <label>
          본문 *
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            required
            rows={12}
            placeholder="내용을 입력하세요"
          />
        </label>
      </div>

      {isReviewBoard && (
        <FigureInfoForm value={figureInfo} onChange={setFigureInfo} />
      )}

      <ImageUploader
        disabled={isSubmitting}
        value={images}
        onChange={setImages}
      />

      <div className="form-actions">
        <button type="submit" disabled={isSubmitting || !boardCode}>
          {isEditMode ? "수정 완료" : "게시글 작성"}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          취소
        </button>
      </div>
    </form>
  );
}


function buildInitialFigureInfo(post) {
  if (!post?.figure_info) {
    return EMPTY_FIGURE_INFO;
  }

  return {
    figure_name: post.figure_info.figure_name || "",
    manufacturer: post.figure_info.manufacturer || "",
    figure_type: post.figure_info.figure_type || "",
    price_amount:
      post.figure_info.price_amount === null ||
      post.figure_info.price_amount === undefined
        ? ""
        : String(post.figure_info.price_amount),
    price_range: post.figure_info.price_range || "",
    purchase_date: post.figure_info.purchase_date || "",
    satisfaction_score:
      post.figure_info.satisfaction_score === null ||
      post.figure_info.satisfaction_score === undefined
        ? ""
        : String(post.figure_info.satisfaction_score),
  };
}


function buildFigureInfoPayload(figureInfo) {
  return {
    figure_name: figureInfo.figure_name.trim(),
    manufacturer: optionalText(figureInfo.manufacturer),
    figure_type: optionalText(figureInfo.figure_type),
    price_amount: optionalNumber(figureInfo.price_amount),
    price_range: optionalText(figureInfo.price_range),
    purchase_date: optionalText(figureInfo.purchase_date),
    satisfaction_score: optionalNumber(figureInfo.satisfaction_score),
    target_type: "REVIEW_TARGET",
  };
}


function optionalText(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}


function optionalNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  return Number(value);
}


export default PostForm;
