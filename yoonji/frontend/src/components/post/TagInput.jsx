import { useEffect, useMemo, useState } from "react";

import { getTags } from "../../api/tagApi";
import { getApiErrorMessage } from "../../hooks/usePosts";


const TAG_TYPE_OPTIONS = [
  { value: "GENERAL", label: "일반" },
  { value: "CHARACTER", label: "캐릭터" },
  { value: "WORK", label: "작품" },
  { value: "MANUFACTURER", label: "제조사" },
  { value: "TOPIC", label: "주제" },
  { value: "PRICE", label: "가격" },
];


function TagInput({
  disabled = false,
  maxTags = 10,
  onChange,
  value = [],
}) {
  const [query, setQuery] = useState("");
  const [tagType, setTagType] = useState("GENERAL");
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedKeys = useMemo(
    () => new Set(value.map((tag) => makeTagKey(tag.name, tag.tag_type))),
    [value],
  );

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    let ignore = false;
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setErrorMessage("");

      try {
        const response = await getTags({
          q: trimmed,
          type: tagType,
          limit: 8,
        });

        if (!ignore) {
          setSuggestions(response.items);
        }
      } catch (error) {
        if (!ignore) {
          setSuggestions([]);
          setErrorMessage(getApiErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsSearching(false);
        }
      }
    }, 180);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [query, tagType]);

  function addTag(tag) {
    const cleanedName = tag.name.trim();

    if (!cleanedName) {
      setErrorMessage("태그명을 입력해 주세요.");
      return;
    }

    if (value.length >= maxTags) {
      setErrorMessage(`태그는 최대 ${maxTags}개까지 입력할 수 있습니다.`);
      return;
    }

    const nextTag = {
      name: cleanedName,
      tag_type: tag.tag_type || tagType,
    };
    const nextKey = makeTagKey(nextTag.name, nextTag.tag_type);

    if (selectedKeys.has(nextKey)) {
      setErrorMessage("이미 추가한 태그입니다.");
      return;
    }

    onChange([...value, nextTag]);
    setQuery("");
    setSuggestions([]);
    setErrorMessage("");
  }

  function removeTag(tagToRemove) {
    const removeKey = makeTagKey(tagToRemove.name, tagToRemove.tag_type);
    onChange(
      value.filter((tag) => makeTagKey(tag.name, tag.tag_type) !== removeKey),
    );
  }

  function handleAddButtonClick() {
    addTag({ name: query, tag_type: tagType });
  }

  return (
    <section className="tag-input-panel" aria-labelledby="tag-input-title">
      <div className="tag-input-heading">
        <h3 id="tag-input-title">태그</h3>
      </div>

      <div className="tag-input-controls">
        <label>
          태그 유형
          <select
            value={tagType}
            onChange={(event) => setTagType(event.target.value)}
            disabled={disabled}
          >
            {TAG_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          태그명
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
            placeholder="예: 하츠네 미쿠"
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddButtonClick();
              }
            }}
          />
        </label>

        <button
          type="button"
          onClick={handleAddButtonClick}
          disabled={disabled || !query.trim()}
        >
          추가
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="tag-suggestion-list" aria-label="tag suggestions">
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="tag-suggestion"
              onClick={() => addTag(tag)}
              disabled={disabled || selectedKeys.has(makeTagKey(tag.name, tag.tag_type))}
            >
              <span>{tag.name}</span>
              <small>{tag.tag_type}</small>
            </button>
          ))}
        </div>
      )}

      {isSearching && <p className="empty-text">태그를 검색하는 중입니다.</p>}
      {errorMessage && <p className="form-message error">{errorMessage}</p>}

      {value.length > 0 && (
        <div className="selected-tag-list" aria-label="selected tags">
          {value.map((tag) => (
            <button
              key={makeTagKey(tag.name, tag.tag_type)}
              type="button"
              className="selected-tag"
              onClick={() => removeTag(tag)}
              disabled={disabled}
            >
              <span>{tag.name}</span>
              <small>{tag.tag_type}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}


function makeTagKey(name, tagType) {
  return `${normalizeTagName(name)}::${tagType}`;
}


function normalizeTagName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, "");
}


export default TagInput;
