const FOOD_NAME_ALIASES = new Map<string, string>([
  ['달걀', '계란'],
  ['계란후라이', '계란'],
  ['달걀후라이', '계란'],
  ['파', '대파'],
  ['쪽파', '대파'],
  ['참치캔', '참치'],
  ['캔참치', '참치'],
  ['스팸', '햄'],
  ['고추참치', '참치'],
  ['순두부', '두부'],
  ['흰밥', '밥'],
  ['쌀밥', '밥'],
  ['공기밥', '밥'],
  ['다진마늘', '마늘'],
]);

export function normalizeFoodName(input: string) {
  const compacted = input
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[()[\]{}]/g, '')
    .replace(/(남은|냉장|냉동|익힌|삶은|구운|자른|다진)\s*/g, '')
    .trim();

  return FOOD_NAME_ALIASES.get(compacted) ?? compacted;
}

export function buildFoodSearchQueries(input: string) {
  const normalized = normalizeFoodName(input);
  const queries = [normalized, input.trim()].filter(Boolean);

  if (normalized === '계란') {
    queries.push('달걀');
  }

  if (normalized === '대파') {
    queries.push('파');
  }

  if (normalized === '참치') {
    queries.push('참치캔');
  }

  return [...new Set(queries)];
}
