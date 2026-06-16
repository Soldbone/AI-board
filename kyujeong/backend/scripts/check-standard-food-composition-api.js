require('dotenv').config({ quiet: true });

function getConfig() {
  const apiUrl = process.env.STANDARD_FOOD_COMPOSITION_API_URL?.trim() ?? '';

  return {
    apiKey: normalizeServiceKey(
      process.env.STANDARD_FOOD_COMPOSITION_API_KEY?.trim() ?? '',
    ),
    listApiUrl:
      process.env.STANDARD_FOOD_COMPOSITION_LIST_API_URL?.trim() ||
      buildOperationUrl(apiUrl, 'getKoreanFoodNationStdList'),
    detailApiUrl:
      process.env.STANDARD_FOOD_COMPOSITION_DETAIL_API_URL?.trim() ||
      buildOperationUrl(apiUrl, 'getKoreanFoodNationStdIdntList'),
    codeParam:
      process.env.STANDARD_FOOD_COMPOSITION_CODE_PARAM?.trim() ?? 'food_Code',
    groupIds: readCsv(
      process.env.STANDARD_FOOD_COMPOSITION_GROUP_IDS ??
        'A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T',
    ),
    pageSize: readPositiveInteger(
      process.env.STANDARD_FOOD_COMPOSITION_PAGE_SIZE,
      50,
    ),
    maxPagesPerGroup: readPositiveInteger(
      process.env.STANDARD_FOOD_COMPOSITION_MAX_PAGES_PER_GROUP,
      2,
    ),
    timeoutMs: readPositiveInteger(
      process.env.STANDARD_FOOD_COMPOSITION_TIMEOUT_MS,
      10000,
    ),
  };
}

function buildOperationUrl(apiUrl, operationName) {
  if (!apiUrl) {
    return '';
  }

  const trimmedUrl = apiUrl.trim().replace(/\/+$/, '');

  if (/\/getKoreanFoodNationStd(?:Idnt)?List$/.test(trimmedUrl)) {
    return trimmedUrl.replace(
      /\/getKoreanFoodNationStd(?:Idnt)?List$/,
      `/${operationName}`,
    );
  }

  return `${trimmedUrl}/${operationName}`;
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function readArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
}

function extractItems(payload) {
  const root = readRecord(payload) ?? {};
  const response = readRecord(root.response) ?? root;
  const body = readRecord(response.body) ?? response;
  const itemsRoot = readRecord(body.items);

  return readArray(itemsRoot?.item).length
    ? readArray(itemsRoot?.item)
    : readArray(body.items).length
      ? readArray(body.items)
      : readArray(body.item).length
        ? readArray(body.item)
        : readArray(root.data).length
          ? readArray(root.data)
          : readArray(root.list);
}

function readCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readPositiveInteger(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeServiceKey(value) {
  const trimmed = value.trim();

  if (!trimmed.includes('%')) {
    return trimmed;
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function normalizeFoodName(input) {
  const aliases = new Map([
    ['달걀', '계란'],
    ['파', '대파'],
  ]);
  const normalized = String(input ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[()[\]{}]/g, '')
    .replace(/(남은|냉장|냉동|익힌|삶은|구운|자른|다진)\s*/g, '')
    .trim();

  return aliases.get(normalized) ?? normalized;
}

function isRelevantCandidate(query, item) {
  const normalizedQuery = normalizeFoodName(query);
  const name = normalizeFoodName(
    item?.food_Nm ?? item?.foodNm ?? item?.foodName ?? '',
  );

  return (
    name === normalizedQuery ||
    name.includes(normalizedQuery) ||
    normalizedQuery.includes(name)
  );
}

function readFoodCode(item) {
  return (
    item?.food_Code ??
    item?.foodCd ??
    item?.foodCode ??
    item?.FOOD_CD ??
    item?.nationStdFoodCd ??
    item?.koreanFoodCd ??
    item?.stdFoodCd ??
    null
  );
}

function getHeader(payload) {
  const root = readRecord(payload) ?? {};
  const response = readRecord(root.response) ?? root;

  return readRecord(response.header) ?? {};
}

function withoutServiceKey(url) {
  const safeUrl = new URL(url);

  safeUrl.searchParams.set('serviceKey', '***');

  return safeUrl.toString();
}

async function main() {
  const {
    apiKey,
    listApiUrl,
    detailApiUrl,
    codeParam,
    groupIds,
    pageSize,
    maxPagesPerGroup,
    timeoutMs,
  } = getConfig();
  const query = process.argv[2] || '계란';

  if (!apiKey || !listApiUrl) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason:
            'STANDARD_FOOD_COMPOSITION_API_KEY or STANDARD_FOOD_COMPOSITION_API_URL is not configured.',
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
    return;
  }

  let response = null;
  let url = null;
  let items = [];
  let header = {};

  try {
    for (const groupId of groupIds) {
      for (let pageOffset = 0; pageOffset < maxPagesPerGroup; pageOffset += 1) {
        url = new URL(listApiUrl);
        url.searchParams.set('serviceKey', apiKey);
        url.searchParams.set('type', 'json');
        url.searchParams.set('page_No', String(pageOffset + 1));
        url.searchParams.set('Page_Size', String(pageSize));
        url.searchParams.set('fd_Grupp', groupId);

        response = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await response.text();
        let payload = null;

        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }

        header = payload ? getHeader(payload) : {};
        items = payload
          ? extractItems(payload).filter((item) =>
              isRelevantCandidate(query, item),
            )
          : [];

        if (items.length > 0) {
          break;
        }
      }

      if (items.length > 0) {
        break;
      }
    }
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          requestUrl: url ? withoutServiceKey(url) : null,
          reason:
            error instanceof Error
              ? error.message
              : 'Standard food composition API request failed.',
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const firstItem = items[0] ?? null;
  const foodCode = firstItem ? readFoodCode(firstItem) : null;
  let detailStatus = null;
  let detailCandidateCount = 0;
  let detailFirstCandidateKeys = [];

  if (response?.ok && foodCode && detailApiUrl) {
    const detailUrl = new URL(detailApiUrl);

    detailUrl.searchParams.set('serviceKey', apiKey);
    detailUrl.searchParams.set('type', 'json');
    detailUrl.searchParams.set(codeParam, String(foodCode));

    try {
      const detailResponse = await fetch(detailUrl, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      const detailPayload = await detailResponse.json();
      const detailItems = extractItems(detailPayload);

      detailStatus = detailResponse.status;
      detailCandidateCount = detailItems.length;
      detailFirstCandidateKeys = detailItems[0]
        ? Object.keys(detailItems[0]).slice(0, 30)
        : [];
    } catch {
      detailStatus = 'request_failed';
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: Boolean(response?.ok && items.length > 0),
        httpStatus: response?.status ?? null,
        requestUrl: url ? withoutServiceKey(url) : null,
        query,
        listStrategy: 'fd_Grupp 목록 조회 후 food_Nm 로컬 필터링',
        checkedGroupIds: groupIds,
        codeParam,
        resultCode: header.resultCode ?? header.result_Code ?? null,
        resultMessage: header.resultMsg ?? header.result_Msg ?? null,
        candidateCount: items.length,
        firstCandidateKeys: firstItem
          ? Object.keys(firstItem).slice(0, 30)
          : [],
        firstCandidatePreview: firstItem
          ? Object.fromEntries(Object.entries(firstItem).slice(0, 12))
          : null,
        detectedFoodCode: foodCode,
        detailApiUrl: detailApiUrl ? withoutServiceKey(detailApiUrl) : null,
        detailStatus,
        detailCandidateCount,
        detailFirstCandidateKeys,
        hint:
          response?.status === 404
            ? 'The URL is not the callable operation endpoint. Copy the request URL from the API detail function page.'
            : items.length === 0
              ? 'The endpoint responded, but no items were parsed. Check the query parameter name or response fields.'
              : 'The endpoint looks callable.',
      },
      null,
      2,
    ),
  );

  if (!response?.ok) {
    process.exitCode = response?.status === 404 ? 4 : 1;
    return;
  }

  if (items.length === 0) {
    process.exitCode = 5;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
