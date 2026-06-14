require('dotenv').config({ quiet: true });

const DEFAULT_API_URL =
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

function getApiKey() {
  return process.env.PUBLIC_DATA_FOOD_API_KEY?.trim() ?? '';
}

function getApiUrl() {
  return process.env.PUBLIC_DATA_FOOD_API_URL?.trim() || DEFAULT_API_URL;
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

  return (
    readArray(itemsRoot?.item).length
      ? readArray(itemsRoot?.item)
      : readArray(body.items).length
        ? readArray(body.items)
        : readArray(body.item)
  );
}

function readNumber(record, keys) {
  for (const key of keys) {
    const value = record?.[key];

    if (value === undefined || value === null || value === '') {
      continue;
    }

    const numberValue = Number(String(value).replace(/,/g, ''));

    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }

  return null;
}

function summarizeNutrition(record) {
  if (!record) {
    return null;
  }

  return {
    servingSize: record.SERVING_SIZE ?? record.servingSize ?? null,
    energyKcal: readNumber(record, ['AMT_NUM1', 'NUTR_CONT1', 'energyKcal']),
    carbohydrateG: readNumber(record, ['AMT_NUM6', 'NUTR_CONT2']),
    proteinG: readNumber(record, ['AMT_NUM3', 'NUTR_CONT3']),
    fatG: readNumber(record, ['AMT_NUM4', 'NUTR_CONT4']),
    sugarG: readNumber(record, ['AMT_NUM7', 'NUTR_CONT5']),
    sodiumMg: readNumber(record, ['AMT_NUM13', 'NUTR_CONT6']),
  };
}

async function main() {
  const apiKey = getApiKey();
  const query = process.argv[2] || '계란';

  if (!apiKey) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: 'PUBLIC_DATA_FOOD_API_KEY is not configured.',
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
    return;
  }

  const url = new URL(getApiUrl());
  url.searchParams.set('serviceKey', apiKey);
  url.searchParams.set('type', 'json');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '3');
  url.searchParams.set('FOOD_NM_KR', query);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let payload = null;

  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  const items = payload ? extractItems(payload) : [];

  console.log(
    JSON.stringify(
      {
        ok: response.ok && items.length > 0,
        httpStatus: response.status,
        query,
        candidateCount: items.length,
        firstCandidateKeys: items[0] ? Object.keys(items[0]).slice(0, 20) : [],
        firstCandidateName:
          items[0]?.FOOD_NM_KR ??
          items[0]?.foodNm ??
          items[0]?.DESC_KOR ??
          null,
        firstCandidateNutrition: summarizeNutrition(items[0]),
        responseWasJson: Boolean(payload),
      },
      null,
      2,
    ),
  );

  if (!response.ok) {
    process.exitCode = response.status === 429 ? 3 : 1;
    return;
  }

  if (items.length === 0) {
    process.exitCode = 4;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
