export const BOARD_TYPES = [
  {
    code: "REVIEW",
    name: "후기",
    description: "피규어 사진과 구매 후기를 공유하는 게시판",
  },
  {
    code: "INFO",
    name: "정보",
    description: "예약, 발매, 관리 팁 같은 정보를 정리하는 게시판",
  },
  {
    code: "QUESTION",
    name: "질문",
    description: "피규어 구매와 관리에 대해 질문하는 게시판",
  },
  {
    code: "PURCHASE_HELP",
    name: "구매 고민",
    description: "구매 전 고민을 나누고 의견을 받는 게시판",
  },
];

export const BOARD_LABELS = BOARD_TYPES.reduce((labels, board) => {
  labels[board.code] = board.name;
  return labels;
}, {});

export function getBoardLabel(boardCode) {
  return BOARD_LABELS[boardCode] || boardCode || "전체";
}
