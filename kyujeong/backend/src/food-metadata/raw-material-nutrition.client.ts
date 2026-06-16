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
  'https://api.data.go.kr/openapi/tn_pubr_public_nutri_material_info_api';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_PAGES = 25;
const DEFAULT_PAGE_BATCH_SIZE = 4;
const SOURCE_NAME =
  '전국통합식품영양성분정보(원재료성식품)표준데이터';

type FetchLike = typeof fetch;

type RawMaterialNutritionClientOptions = {
  apiKey?: string;
  apiUrl?: string;
  timeoutMs?: number;
  pageSize?: number;
  maxPages?: number;
  pageBatchSize?: number;
  fetchImpl?: FetchLike;
};

export class RawMaterialNutritionClient implements FoodDataClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly pageBatchSize: number;
  private readonly fetchImpl: FetchLike;
  private cachedItems: Array<Record<string, unknown>> = [];
  private cachedTotalCount: number | null = null;
  private cachedLoadedPages = 0;
  private loadMorePromise: Promise<void> | null = null;

  constructor(options: RawMaterialNutritionClientOptions = {}) {
    this.apiKey = this.normalizeServiceKey(
      options.apiKey ??
        process.env.RAW_MATERIAL_NUTRITION_API_KEY?.trim() ??
        process.env.PUBLIC_DATA_FOOD_API_KEY?.trim() ??
        '',
    );
    this.apiUrl =
      options.apiUrl ??
      process.env.RAW_MATERIAL_NUTRITION_API_URL?.trim() ??
      DEFAULT_API_URL;
    this.timeoutMs = this.readPositiveInteger(
      options.timeoutMs,
      process.env.RAW_MATERIAL_NUTRITION_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    );
    this.pageSize = this.readPositiveInteger(
      options.pageSize,
      process.env.RAW_MATERIAL_NUTRITION_PAGE_SIZE,
      DEFAULT_PAGE_SIZE,
    );
    this.maxPages = this.readPositiveInteger(
      options.maxPages,
      process.env.RAW_MATERIAL_NUTRITION_MAX_PAGES,
      DEFAULT_MAX_PAGES,
    );
    this.pageBatchSize = this.readPositiveInteger(
      options.pageBatchSize,
      process.env.RAW_MATERIAL_NUTRITION_PAGE_BATCH_SIZE,
      DEFAULT_PAGE_BATCH_SIZE,
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search({
    query,
    limit = 10,
  }: FoodDataClientSearchOptions): Promise<FoodSearchResult> {
    const normalizedInput = normalizeFoodName(query);

    if (!this.apiKey) {
      return this.createEmptyResult(
        query,
        normalizedInput,
        'configuration_missing',
        'RAW_MATERIAL_NUTRITION_API_KEY is not configured.',
      );
    }

    try {
      const candidates = await this.findCandidates(
        query,
        normalizedInput,
        Math.max(limit, 1),
      );

      return {
        originalInput: query,
        normalizedInput,
        candidates,
        totalCount: candidates.length,
        source: SOURCE_NAME,
        matchStatus: candidates.some(
          (candidate) => candidate.matchStatus === 'matched',
        )
          ? 'matched'
          : candidates.length > 0
            ? 'candidate'
            : 'not_found',
        message:
          candidates.length > 0
            ? null
            : 'No matching raw material nutrition item was returned.',
      };
    } catch (error) {
      this.loadMorePromise = null;

      return this.createEmptyResult(
        query,
        normalizedInput,
        'api_error',
        error instanceof Error
          ? error.message
          : 'Raw material nutrition API request failed.',
      );
    }
  }

  private async findCandidates(
    query: string,
    normalizedInput: string,
    limit: number,
  ) {
    let candidates = this.getCandidatesFromItems(
      this.cachedItems,
      query,
      normalizedInput,
    );

    while (
      !this.hasStrongCandidate(candidates) &&
      this.canLoadMorePages()
    ) {
      await this.loadNextPageBatch();
      candidates = this.getCandidatesFromItems(
        this.cachedItems,
        query,
        normalizedInput,
      );
    }

    return candidates
      .sort(
        (left, right) =>
          this.scoreCandidate(right, normalizedInput) -
          this.scoreCandidate(left, normalizedInput),
      )
      .slice(0, limit);
  }

  private getCandidatesFromItems(
    items: Array<Record<string, unknown>>,
    query: string,
    normalizedInput: string,
  ) {
    return items
      .map((item) => this.toCandidate(item, query, normalizedInput))
      .filter((candidate): candidate is FoodCandidate => Boolean(candidate))
      .filter((candidate) =>
        this.isRelevantCandidate(normalizedInput, candidate.matchedName),
      );
  }

  private canLoadMorePages() {
    if (this.cachedLoadedPages >= this.maxPages) {
      return false;
    }

    return (
      this.cachedTotalCount === null ||
      this.cachedItems.length < this.cachedTotalCount
    );
  }

  private hasStrongCandidate(candidates: FoodCandidate[]) {
    return candidates.some((candidate) => candidate.matchStatus === 'matched');
  }

  private async loadNextPageBatch() {
    this.loadMorePromise ??= this.fetchPageBatch().finally(() => {
      this.loadMorePromise = null;
    });

    return this.loadMorePromise;
  }

  private async fetchPageBatch() {
    const startPage = this.cachedLoadedPages + 1;
    const endPage = Math.min(
      this.maxPages,
      startPage + this.pageBatchSize - 1,
    );
    const pageResults = await Promise.all(
      Array.from({ length: endPage - startPage + 1 }, (_, index) =>
        this.fetchPage(startPage + index),
      ),
    );

    pageResults
      .sort((left, right) => left.page - right.page)
      .forEach((pageResult) => {
        this.cachedTotalCount ??= pageResult.totalCount;
        this.cachedItems.push(...pageResult.items);
      });
    this.cachedLoadedPages = endPage;
  }

  private async fetchPage(page: number) {
    const response = await this.fetchImpl(this.buildUrl(page), {
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Raw material nutrition API returned HTTP ${response.status}.`);
      }

      const payload = (await response.json()) as unknown;
      const parsed = this.parseResponse(payload);

      if (parsed.resultCode && parsed.resultCode !== '00') {
        throw new Error(
          parsed.resultMessage ??
            `Raw material nutrition API returned result code ${parsed.resultCode}.`,
        );
      }

    return {
      page,
      totalCount: parsed.totalCount,
      items: parsed.items,
    };
  }

  private buildUrl(page: number) {
    const url = new URL(this.apiUrl);

    url.searchParams.set('serviceKey', this.apiKey);
    url.searchParams.set('type', 'json');
    url.searchParams.set('pageNo', String(Math.max(page, 1)));
    url.searchParams.set('numOfRows', String(Math.min(this.pageSize, 1000)));

    return url;
  }

  private parseResponse(payload: unknown) {
    const root = this.asRecord(payload) ?? {};
    const response = this.asRecord(root.response) ?? root;
    const header = this.asRecord(response.header) ?? {};
    const body = this.asRecord(response.body) ?? response;
    const itemsRoot = this.asRecord(body.items);
    const rawItems =
      this.asArray(itemsRoot?.item) ??
      this.asArray(body.items) ??
      this.asArray(body.item) ??
      [];

    return {
      resultCode: this.readString(header.resultCode),
      resultMessage: this.readString(header.resultMsg),
      totalCount:
        this.readNumber(body.totalCount) ??
        this.readNumber(response.totalCount) ??
        rawItems.length,
      items: rawItems
        .map((item) => this.asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item)),
    };
  }

  private toCandidate(
    raw: Record<string, unknown>,
    originalInput: string,
    normalizedInput: string,
  ): FoodCandidate | null {
    const matchedName = this.readFirstString(raw, [
      'foodNm',
      'foodName',
      'food_Nm',
      '식품명',
    ]);

    if (!matchedName) {
      return null;
    }

    return {
      id: this.readFirstString(raw, ['foodCd', 'foodCode', 'food_Cd']) ?? null,
      originalName: originalInput,
      matchedName,
      normalizedName: normalizeFoodName(matchedName),
      servingSize:
        this.readFirstString(raw, [
          'nutConSrtrQua',
          'nutritionStandardAmount',
          '기준량',
        ]) ?? '100g',
      nutrition: this.toNutritionFacts(raw),
      source: SOURCE_NAME,
      matchStatus: this.isExactOrBaseMatch(normalizedInput, matchedName)
        ? 'matched'
        : 'candidate',
      raw,
    };
  }

  private toNutritionFacts(raw: Record<string, unknown>): NutritionFacts {
    return {
      energyKcal: this.readFirstNumber(raw, ['enerc', 'energyKcal', '열량']),
      carbohydrateG: this.readFirstNumber(raw, [
        'chocdf',
        'carbohydrateG',
        '탄수화물',
      ]),
      proteinG: this.readFirstNumber(raw, ['prot', 'proteinG', '단백질']),
      fatG: this.readFirstNumber(raw, ['fatce', 'fatG', '지방']),
      sugarG: this.readFirstNumber(raw, ['sugar', 'sugarG', '당류']),
      sodiumMg: this.readFirstNumber(raw, ['nat', 'sodiumMg', '나트륨']),
    };
  }

  private isRelevantCandidate(normalizedInput: string, matchedName: string) {
    const normalizedMatchedName = this.normalizeMatchText(matchedName);
    const normalizedBaseName = this.normalizeMatchText(
      this.getBaseFoodName(matchedName),
    );
    const normalizedQuery = this.normalizeMatchText(normalizedInput);

    return (
      normalizedMatchedName.includes(normalizedQuery) ||
      normalizedBaseName.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedBaseName)
    );
  }

  private isExactOrBaseMatch(normalizedInput: string, matchedName: string) {
    const normalizedQuery = this.normalizeMatchText(normalizedInput);

    return (
      this.normalizeMatchText(matchedName) === normalizedQuery ||
      this.normalizeMatchText(this.getBaseFoodName(matchedName)) ===
        normalizedQuery
    );
  }

  private scoreCandidate(candidate: FoodCandidate, normalizedInput: string) {
    const normalizedQuery = this.normalizeMatchText(normalizedInput);
    const normalizedMatchedName = this.normalizeMatchText(candidate.matchedName);
    const normalizedBaseName = this.normalizeMatchText(
      this.getBaseFoodName(candidate.matchedName),
    );
    let score = 0;

    if (normalizedMatchedName === normalizedQuery) {
      score += 1000;
    } else if (normalizedBaseName === normalizedQuery) {
      score += 900;
    } else if (normalizedMatchedName.startsWith(normalizedQuery)) {
      score += 350;
    } else if (normalizedMatchedName.includes(normalizedQuery)) {
      score += 180;
    }

    if (/(생것|원재료|신선)/.test(candidate.matchedName)) {
      score += 80;
    }

    if (
      /(볶음|튀김|구이|조림|국|찌개|탕|소스|분말|가루|절임|조미|가공|즉석)/.test(
        candidate.matchedName,
      )
    ) {
      score -= 180;
    }

    return score - candidate.matchedName.length;
  }

  private getBaseFoodName(foodName: string) {
    return foodName.split(/[_/,()]/)[0]?.trim() ?? foodName;
  }

  private normalizeMatchText(value: string) {
    return normalizeFoodName(value).replace(/[\s_(),/.-]/g, '');
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

  private readFirstString(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = this.readString(record[key]);

      if (value) {
        return value;
      }
    }

    return null;
  }

  private readFirstNumber(record: Record<string, unknown>, keys: string[]) {
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

  private normalizeServiceKey(value: string) {
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

  private readPositiveInteger(
    optionValue: number | undefined,
    envValue: string | undefined,
    fallback: number,
  ) {
    const parsedOption = Number(optionValue);

    if (Number.isFinite(parsedOption) && parsedOption > 0) {
      return Math.floor(parsedOption);
    }

    const parsedEnv = Number(envValue);

    return Number.isFinite(parsedEnv) && parsedEnv > 0
      ? Math.floor(parsedEnv)
      : fallback;
  }
}
