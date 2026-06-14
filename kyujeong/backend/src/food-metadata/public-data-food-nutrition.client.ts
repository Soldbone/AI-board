import {
  FoodCandidate,
  FoodDataClient,
  FoodDataClientSearchOptions,
  FoodSearchResult,
  MatchStatus,
  NutritionFacts,
} from './food-metadata.types';
import { normalizeFoodName } from './food-name-normalizer';

const DEFAULT_API_URL =
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';
const DEFAULT_TIMEOUT_MS = 10000;
const SOURCE_NAME = '공공데이터포털 식품영양성분 API';

type FetchLike = typeof fetch;

type PublicDataFoodNutritionClientOptions = {
  apiKey?: string;
  apiUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

export class PublicDataFoodNutritionClient implements FoodDataClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: PublicDataFoodNutritionClientOptions = {}) {
    this.apiKey =
      options.apiKey ?? process.env.PUBLIC_DATA_FOOD_API_KEY?.trim() ?? '';
    this.apiUrl =
      options.apiUrl ?? process.env.PUBLIC_DATA_FOOD_API_URL ?? DEFAULT_API_URL;
    const configuredTimeoutMs = Number(
      process.env.PUBLIC_DATA_FOOD_API_TIMEOUT_MS,
    );
    this.timeoutMs =
      options.timeoutMs ??
      (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
        ? configuredTimeoutMs
        : DEFAULT_TIMEOUT_MS);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search({
    query,
    page = 1,
    limit = 10,
  }: FoodDataClientSearchOptions): Promise<FoodSearchResult> {
    const normalizedInput = normalizeFoodName(query);

    if (!this.apiKey) {
      return this.createEmptyResult(
        query,
        normalizedInput,
        'configuration_missing',
        'PUBLIC_DATA_FOOD_API_KEY is not configured.',
      );
    }

    try {
      const response = await this.fetchImpl(
        this.buildUrl(normalizedInput, page, limit),
        {
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );

      if (!response.ok) {
        return this.createEmptyResult(
          query,
          normalizedInput,
          response.status === 429 ? 'rate_limited' : 'api_error',
          `Public data API returned HTTP ${response.status}.`,
        );
      }

      const data = (await response.json()) as unknown;
      const parsed = this.parseResponse(data, query, normalizedInput);

      if (parsed.candidates.length === 0) {
        return {
          ...parsed,
          matchStatus: 'not_found',
          message: 'No matching food item was returned.',
        };
      }

      return parsed;
    } catch (error) {
      return this.createEmptyResult(
        query,
        normalizedInput,
        'api_error',
        error instanceof Error
          ? error.message
          : 'Public data API request failed.',
      );
    }
  }

  private buildUrl(query: string, page: number, limit: number) {
    const url = new URL(this.apiUrl);

    url.searchParams.set('serviceKey', this.apiKey);
    url.searchParams.set('type', 'json');
    url.searchParams.set('pageNo', String(Math.max(page, 1)));
    url.searchParams.set('numOfRows', String(Math.min(Math.max(limit, 1), 50)));
    url.searchParams.set('FOOD_NM_KR', query);

    return url;
  }

  private parseResponse(
    data: unknown,
    originalInput: string,
    normalizedInput: string,
  ): FoodSearchResult {
    const root = this.asRecord(data) ?? {};
    const response = this.asRecord(root.response) ?? root;
    const header = this.asRecord(response.header);
    const body = this.asRecord(response.body) ?? response;
    const resultCode = this.readString(header?.resultCode);
    const resultMessage = this.readString(header?.resultMsg);
    const itemsRoot = this.asRecord(body.items);
    const rawItems =
      this.asArray(itemsRoot?.item) ??
      this.asArray(body.items) ??
      this.asArray(body.item) ??
      [];

    if (resultCode && resultCode !== '00' && rawItems.length === 0) {
      return this.createEmptyResult(
        originalInput,
        normalizedInput,
        'api_error',
        resultMessage ?? `Public data API returned result code ${resultCode}.`,
      );
    }

    const candidates = rawItems
      .map((item) => this.toCandidate(item, originalInput, normalizedInput))
      .filter((item): item is FoodCandidate => Boolean(item));
    const totalCount =
      this.readNumber(body.totalCount) ??
      this.readNumber(response.totalCount) ??
      candidates.length;

    return {
      originalInput,
      normalizedInput,
      candidates,
      totalCount,
      source: SOURCE_NAME,
      matchStatus: candidates.length > 0 ? 'candidate' : 'not_found',
      message: resultMessage,
    };
  }

  private toCandidate(
    item: unknown,
    originalInput: string,
    normalizedInput: string,
  ): FoodCandidate | null {
    const raw = this.asRecord(item);

    if (!raw) {
      return null;
    }

    const matchedName =
      this.readFirstString(raw, [
        'FOOD_NM_KR',
        'foodNm',
        'foodName',
        'DESC_KOR',
        'FOOD_NM',
        '식품명',
      ]) ?? normalizedInput;
    const id =
      this.readFirstString(raw, [
        'FOOD_CD',
        'foodCd',
        'foodCode',
        'fdcId',
        'id',
        '식품코드',
      ]) ?? null;
    const servingSize =
      this.readFirstString(raw, [
        'SERVING_SIZE',
        'SERVING_WT',
        'servingSize',
        'servingWt',
        'NUTR_STANDARD_AMOUNT',
        'nutritionContentStandardAmount',
        '총내용량',
        '1회제공량',
      ]) ?? null;

    return {
      id,
      originalName: originalInput,
      matchedName,
      normalizedName: normalizeFoodName(matchedName),
      servingSize,
      nutrition: this.toNutritionFacts(raw),
      source: SOURCE_NAME,
      matchStatus: this.isStrongMatch(normalizedInput, matchedName)
        ? 'matched'
        : 'candidate',
      raw,
    };
  }

  private toNutritionFacts(raw: Record<string, unknown>): NutritionFacts {
    return {
      energyKcal: this.readFirstNumber(raw, [
        'AMT_NUM1',
        'NUTR_CONT1',
        'enerc',
        'ENERC',
        'energyKcal',
        'calorie',
        'CALORIE',
        '열량',
        '에너지',
      ]),
      carbohydrateG: this.readFirstNumber(raw, [
        'AMT_NUM6',
        'NUTR_CONT2',
        'chocdf',
        'CHOCDF',
        'carbohydrateG',
        'carbohydrate',
        '탄수화물',
      ]),
      proteinG: this.readFirstNumber(raw, [
        'AMT_NUM3',
        'NUTR_CONT3',
        'prot',
        'PROT',
        'proteinG',
        'protein',
        '단백질',
      ]),
      fatG: this.readFirstNumber(raw, [
        'AMT_NUM4',
        'NUTR_CONT4',
        'fatce',
        'FATCE',
        'fatG',
        'fat',
        '지방',
      ]),
      sugarG: this.readFirstNumber(raw, [
        'AMT_NUM7',
        'NUTR_CONT5',
        'sugar',
        'SUGAR',
        'sugarG',
        '당류',
      ]),
      sodiumMg: this.readFirstNumber(raw, [
        'AMT_NUM13',
        'NUTR_CONT6',
        'nat',
        'NAT',
        'sodiumMg',
        'sodium',
        '나트륨',
      ]),
    };
  }

  private isStrongMatch(normalizedInput: string, matchedName: string) {
    const normalizedMatchedName = normalizeFoodName(matchedName);

    return (
      normalizedMatchedName === normalizedInput ||
      normalizedMatchedName.includes(normalizedInput) ||
      normalizedInput.includes(normalizedMatchedName)
    );
  }

  private createEmptyResult(
    originalInput: string,
    normalizedInput: string,
    matchStatus: MatchStatus,
    message: string,
  ): FoodSearchResult {
    return {
      originalInput,
      normalizedInput,
      candidates: [],
      totalCount: 0,
      source: SOURCE_NAME,
      matchStatus,
      message,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private asArray(value: unknown): unknown[] | null {
    if (Array.isArray(value)) {
      return Array.from(value as readonly unknown[]);
    }

    if (value === undefined || value === null) {
      return null;
    }

    return [value];
  }

  private readFirstString(
    record: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const value = this.readString(record[key]);

      if (value) {
        return value;
      }
    }

    return null;
  }

  private readFirstNumber(
    record: Record<string, unknown>,
    keys: string[],
  ): number | null {
    for (const key of keys) {
      const value = this.readNumber(record[key]);

      if (value !== null) {
        return value;
      }
    }

    return null;
  }

  private readString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();

      return trimmed ? trimmed : null;
    }

    if (typeof value === 'number') {
      return String(value);
    }

    return null;
  }

  private readNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.replace(/,/g, '').replace(/[^\d.-]/g, '');

    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : null;
  }
}
