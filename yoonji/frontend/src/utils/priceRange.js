export const PRICE_RANGE_FILTER_OPTIONS = [
  { value: "", label: "전체 가격대" },
  { value: "0_50000", label: "0 ~ 5만원" },
  { value: "50000_100000", label: "5 ~ 10만원" },
  { value: "100000_200000", label: "10 ~ 20만원" },
  { value: "200000_500000", label: "20 ~ 50만원" },
  { value: "OVER_500000", label: "50만원 이상" },
  { value: "UNKNOWN", label: "가격 미상" },
];

const PRICE_RANGE_LABELS = {
  "0_50000": "0 ~ 5만원",
  UNDER_30000: "0 ~ 5만원",
  "30000_50000": "0 ~ 5만원",
  "50000_100000": "5 ~ 10만원",
  "100000_200000": "10 ~ 20만원",
  "200000_500000": "20 ~ 50만원",
  OVER_200000: "20만원 이상",
  OVER_500000: "50만원 이상",
  UNKNOWN: "가격 미상",
};


export function formatPriceRange(value) {
  if (!value) {
    return "-";
  }

  return PRICE_RANGE_LABELS[value] || value;
}
