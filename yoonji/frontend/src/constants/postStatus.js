export const POST_STATUS_LABELS = {
  DRAFT: "임시저장",
  PUBLISHED: "게시됨",
  PENDING_REVIEW: "검토 대기",
  HIDDEN: "숨김",
  DELETED: "삭제됨",
};

export function getPostStatusLabel(status) {
  return POST_STATUS_LABELS[status] || status || "-";
}
