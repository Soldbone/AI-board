const FIGURE_TYPE_OPTIONS = [
  { value: "", label: "선택 안 함" },
  { value: "SCALE", label: "스케일" },
  { value: "NENDOROID", label: "넨도로이드" },
  { value: "FIGMA", label: "피그마" },
  { value: "ACTION_FIGURE", label: "액션 피규어" },
  { value: "PRIZE", label: "프라이즈" },
  { value: "GARAGE_KIT", label: "개러지 키트" },
  { value: "OTHER", label: "기타" },
];

function FigureInfoForm({ value, onChange }) {
  function updateField(fieldName, fieldValue) {
    onChange({
      ...value,
      [fieldName]: fieldValue,
    });
  }

  return (
    <fieldset className="form-fieldset">
      <legend>후기 피규어 정보</legend>

      <div className="form-grid two-columns">
        <label>
          피규어명 *
          <input
            type="text"
            value={value.figure_name}
            onChange={(event) => updateField("figure_name", event.target.value)}
            placeholder="예: 하츠네 미쿠 NT 스타일"
            required
          />
        </label>

        <label>
          제조사
          <input
            type="text"
            value={value.manufacturer}
            onChange={(event) => updateField("manufacturer", event.target.value)}
            placeholder="예: Good Smile Company"
          />
        </label>

        <label>
          종류
          <select
            value={value.figure_type}
            onChange={(event) => updateField("figure_type", event.target.value)}
          >
            {FIGURE_TYPE_OPTIONS.map((option) => (
              <option key={option.value || "empty"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          구매 가격
          <input
            type="number"
            min="0"
            step="100"
            value={value.price_amount}
            onChange={(event) => updateField("price_amount", event.target.value)}
            placeholder="예: 68000"
          />
        </label>

        <label>
          구매일
          <input
            type="date"
            value={value.purchase_date}
            onChange={(event) => updateField("purchase_date", event.target.value)}
          />
        </label>

        <label>
          만족도 *
          <select
            value={value.satisfaction_score}
            onChange={(event) =>
              updateField("satisfaction_score", event.target.value)
            }
            required
          >
            <option value="">선택해 주세요</option>
            <option value="1">1점</option>
            <option value="2">2점</option>
            <option value="3">3점</option>
            <option value="4">4점</option>
            <option value="5">5점</option>
          </select>
        </label>
      </div>
    </fieldset>
  );
}


export default FigureInfoForm;
