import {
  FoodCandidate,
  FoodDataClient,
  FoodDataClientSearchOptions,
  FoodSearchResult,
  MatchStatus,
  NutritionFacts,
} from './food-metadata.types';
import { normalizeFoodName } from './food-name-normalizer';

const DEFAULT_TIMEOUT_MS = 10000;
const SOURCE_NAME = '국가표준식품성분표';

type FetchLike = typeof fetch;

type StandardFoodCompositionClientOptions = {
  apiKey?: string;
  apiUrl?: string;
  listApiUrl?: string;
  detailApiUrl?: string;
  codeParam?: string;
  groupIds?: string[];
  pageSize?: number;
  maxPagesPerGroup?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

export class StandardFoodCompositionClient implements FoodDataClient {
  private readonly apiKey: string;
  private readonly listApiUrl: string;
  private readonly detailApiUrl: string;
  private readonly codeParam: string;
  private readonly groupIds: string[];
  private readonly pageSize: number;
  private readonly maxPagesPerGroup: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: StandardFoodCompositionClientOptions = {}) {
    this.apiKey =
      this.normalizeServiceKey(
        options.apiKey ??
          process.env.STANDARD_FOOD_COMPOSITION_API_KEY?.trim() ??
          '',
      );
    const configuredApiUrl =
      options.apiUrl ??
      process.env.STANDARD_FOOD_COMPOSITION_API_URL?.trim() ??
      '';
    this.listApiUrl =
      options.listApiUrl ??
      process.env.STANDARD_FOOD_COMPOSITION_LIST_API_URL?.trim() ??
      this.buildOperationUrl(
        configuredApiUrl,
        'getKoreanFoodNationStdList',
      );
    this.detailApiUrl =
      options.detailApiUrl ??
      process.env.STANDARD_FOOD_COMPOSITION_DETAIL_API_URL?.trim() ??
      this.buildOperationUrl(
        configuredApiUrl,
        'getKoreanFoodNationStdIdntList',
      );
    this.codeParam =
      options.codeParam ??
      process.env.STANDARD_FOOD_COMPOSITION_CODE_PARAM?.trim() ??
      'food_Code';
    this.groupIds =
      options.groupIds ??
      this.readCsv(
        process.env.STANDARD_FOOD_COMPOSITION_GROUP_IDS ??
          'A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T',
      );
    this.pageSize = this.readPositiveInteger(
      options.pageSize,
      process.env.STANDARD_FOOD_COMPOSITION_PAGE_SIZE,
      50,
    );
    this.maxPagesPerGroup = this.readPositiveInteger(
      options.maxPagesPerGroup,
      process.env.STANDARD_FOOD_COMPOSITION_MAX_PAGES_PER_GROUP,
      2,
    );
    const configuredTimeoutMs = Number(
      process.env.STANDARD_FOOD_COMPOSITION_TIMEOUT_MS,
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

    if (!this.apiKey || !this.listApiUrl) {
      return this.createEmptyResult(
        query,
        normalizedInput,
        'configuration_missing',
        'STANDARD_FOOD_COMPOSITION_API_KEY or STANDARD_FOOD_COMPOSITION_API_URL is not configured.',
      );
    }

    try {
      const parsed = await this.searchListPages(
        query,
        normalizedInput,
        page,
        limit,
      );
      const candidates = await this.enrichCandidatesWithDetail(
        parsed.candidates,
        normalizedInput,
      );
      const enrichedResult = {
        ...parsed,
        candidates,
      };

      if (enrichedResult.candidates.length === 0) {
        return {
          ...enrichedResult,
          matchStatus: 'not_found',
          message: 'No matching standard food item was returned.',
        };
      }

      return enrichedResult;
    } catch (error) {
      return this.createEmptyResult(
        query,
        normalizedInput,
        'api_error',
        error instanceof Error
          ? error.message
          : 'Standard food composition API request failed.',
      );
    }
  }

  private buildOperationUrl(apiUrl: string, operationName: string) {
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

  private buildListUrl(groupId: string, page: number, limit: number) {
    const url = new URL(this.listApiUrl);

    url.searchParams.set('serviceKey', this.apiKey);
    url.searchParams.set('type', 'json');
    url.searchParams.set('page_No', String(Math.max(page, 1)));
    url.searchParams.set('Page_Size', String(Math.min(Math.max(limit, 1), 100)));
    url.searchParams.set('fd_Grupp', groupId);

    return url;
  }

  private buildDetailUrl(foodCode: string) {
    if (!this.detailApiUrl) {
      return null;
    }

    const url = new URL(this.detailApiUrl);

    url.searchParams.set('serviceKey', this.apiKey);
    url.searchParams.set('type', 'json');
    url.searchParams.set(this.codeParam, foodCode);

    return url;
  }

  private async searchListPages(
    originalInput: string,
    normalizedInput: string,
    page: number,
    limit: number,
  ): Promise<FoodSearchResult> {
    const candidates: FoodCandidate[] = [];
    let totalCount = 0;
    let firstMessage: string | null = null;
    let lastError: FoodSearchResult | null = null;
    const pageSize = Math.min(Math.max(limit, this.pageSize, 1), 100);
    const startPage = Math.max(page, 1);

    for (const groupId of this.groupIds) {
      for (
        let pageOffset = 0;
        pageOffset < this.maxPagesPerGroup;
        pageOffset += 1
      ) {
        const response = await this.fetchImpl(
          this.buildListUrl(groupId, startPage + pageOffset, pageSize),
          {
            signal: AbortSignal.timeout(this.timeoutMs),
          },
        );

        if (!response.ok) {
          lastError = this.createEmptyResult(
            originalInput,
            normalizedInput,
            response.status === 429 ? 'rate_limited' : 'api_error',
            `Standard food composition API returned HTTP ${response.status}.`,
          );
          continue;
        }

        const data = (await response.json()) as unknown;
        const parsed = this.parseResponse(data, originalInput, normalizedInput);

        if (parsed.message && !firstMessage) {
          firstMessage = parsed.message;
        }

        totalCount += parsed.totalCount;
        candidates.push(
          ...parsed.candidates.filter((candidate) =>
            this.isRelevantCandidate(normalizedInput, candidate.matchedName),
          ),
        );

        if (candidates.some((candidate) => candidate.matchStatus === 'matched')) {
          return {
            originalInput,
            normalizedInput,
            candidates: this.uniqueCandidates(candidates),
            totalCount,
            source: SOURCE_NAME,
            matchStatus: 'matched',
            message: firstMessage,
          };
        }
      }
    }

    const uniqueCandidates = this.uniqueCandidates(candidates);

    if (uniqueCandidates.length > 0) {
      return {
        originalInput,
        normalizedInput,
        candidates: uniqueCandidates,
        totalCount,
        source: SOURCE_NAME,
        matchStatus: 'candidate',
        message: firstMessage,
      };
    }

    return (
      lastError ??
      this.createEmptyResult(
        originalInput,
        normalizedInput,
        'not_found',
        'No matching standard food item was returned.',
      )
    );
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
    const resultCode = this.readFirstString(header ?? {}, [
      'resultCode',
      'result_Code',
      'result_code',
    ]);
    const resultMessage = this.readFirstString(header ?? {}, [
      'resultMsg',
      'result_Msg',
      'result_msg',
    ]);
    const itemsRoot = this.asRecord(body.items);
    const rawItems =
      this.asArray(itemsRoot?.item) ??
      this.asArray(body.items) ??
      this.asArray(body.item) ??
      this.asArray(root.data) ??
      this.asArray(root.list) ??
      [];

    if (resultCode && resultCode !== '00' && rawItems.length === 0) {
      return this.createEmptyResult(
        originalInput,
        normalizedInput,
        'api_error',
        resultMessage ??
          `Standard food composition API returned result code ${resultCode}.`,
      );
    }

    const candidates = rawItems
      .map((item) => this.toCandidate(item, originalInput, normalizedInput))
      .filter((item): item is FoodCandidate => Boolean(item));
    const totalCount =
      this.readNumber(body.totalCount) ??
      this.readNumber(body.total_Count) ??
      this.readNumber(response.totalCount) ??
      this.readNumber(response.total_Count) ??
      this.readNumber(root.totalCount) ??
      this.readNumber(root.total_Count) ??
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
        'foodNm',
        'food_Nm',
        'foodName',
        'FOOD_NM_KR',
        'DESC_KOR',
        '식품명',
        '식품이름',
        '대표식품명',
      ]) ?? normalizedInput;
    const id =
      this.readFoodCode(raw) ?? null;
    const servingSize =
      this.readFirstString(raw, [
        'servingSize',
        'servingWt',
        'irdnt_Base_Nm',
        'NUTR_STANDARD_AMOUNT',
        'nutritionContentStandardAmount',
        '기준량',
        '분석량',
        '1회제공량',
      ]) ?? '100g';

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

  private async enrichCandidatesWithDetail(
    candidates: FoodCandidate[],
    normalizedInput: string,
  ) {
    const enrichedCandidates: FoodCandidate[] = [];

    for (const candidate of candidates.slice(0, 5)) {
      if (this.hasNutrition(candidate)) {
        enrichedCandidates.push(candidate);
        continue;
      }

      const detailUrl = candidate.id ? this.buildDetailUrl(candidate.id) : null;

      if (!detailUrl) {
        enrichedCandidates.push(candidate);
        continue;
      }

      try {
        const response = await this.fetchImpl(detailUrl, {
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          enrichedCandidates.push(candidate);
          continue;
        }

        const detailData = (await response.json()) as unknown;
        const detailResult = this.parseResponse(
          detailData,
          candidate.originalName,
          normalizedInput,
        );
        const detailCandidate =
          detailResult.candidates.find((item) => this.hasNutrition(item)) ??
          null;

        enrichedCandidates.push(
          detailCandidate
            ? {
                ...candidate,
                matchedName: detailCandidate.matchedName || candidate.matchedName,
                servingSize: detailCandidate.servingSize ?? candidate.servingSize,
                nutrition: detailCandidate.nutrition,
                raw: {
                  ...candidate.raw,
                  detail: detailCandidate.raw,
                },
              }
            : candidate,
        );
      } catch {
        enrichedCandidates.push(candidate);
      }
    }

    return enrichedCandidates;
  }

  private hasNutrition(candidate: FoodCandidate) {
    return Object.values(candidate.nutrition).some(
      (value) => typeof value === 'number',
    );
  }

  private readFoodCode(raw: Record<string, unknown>) {
    return this.readFirstString(raw, [
      'foodCd',
      'food_Code',
      'foodCode',
      'FOOD_CD',
      'nationStdFoodCd',
      'koreanFoodCd',
      'stdFoodCd',
      '식품코드',
      '국가표준식품코드',
      'id',
    ]);
  }

  private toNutritionFacts(raw: Record<string, unknown>): NutritionFacts {
    const ingredientFacts = this.toNutritionFactsFromIngredients(raw);

    if (ingredientFacts) {
      return ingredientFacts;
    }

    return {
      energyKcal: this.readFirstNumber(raw, [
        'energyKcal',
        'enerc',
        'ENERC',
        'NUTR_CONT1',
        'AMT_NUM1',
        '에너지',
        '열량',
        '에너지(kcal)',
      ]),
      carbohydrateG: this.readFirstNumber(raw, [
        'carbohydrateG',
        'chocdf',
        'CHOCDF',
        'NUTR_CONT2',
        'AMT_NUM6',
        '탄수화물',
        '탄수화물(g)',
      ]),
      proteinG: this.readFirstNumber(raw, [
        'proteinG',
        'prot',
        'PROT',
        'NUTR_CONT3',
        'AMT_NUM3',
        '단백질',
        '단백질(g)',
      ]),
      fatG: this.readFirstNumber(raw, [
        'fatG',
        'fatce',
        'FATCE',
        'NUTR_CONT4',
        'AMT_NUM4',
        '지방',
        '지방(g)',
      ]),
      sugarG: this.readFirstNumber(raw, [
        'sugarG',
        'sugar',
        'SUGAR',
        'NUTR_CONT5',
        'AMT_NUM7',
        '당류',
        '당류(g)',
      ]),
      sodiumMg: this.readFirstNumber(raw, [
        'sodiumMg',
        'nat',
        'NAT',
        'NUTR_CONT6',
        'AMT_NUM13',
        '나트륨',
        '나트륨(mg)',
      ]),
    };
  }

  private toNutritionFactsFromIngredients(
    raw: Record<string, unknown>,
  ): NutritionFacts | null {
    const ingredientRoot = this.asRecord(raw.irdnt);
    const ingredientItems =
      this.asArray(ingredientRoot?.irdntCtket) ??
      this.asArray(ingredientRoot?.irdnttcket) ??
      this.asArray(ingredientRoot?.irdntTcket) ??
      this.asArray(ingredientRoot?.irdntTicket) ??
      this.asArray(raw.irdntCtket) ??
      this.asArray(raw.irdnttcket) ??
      this.asArray(raw.irdntTcket) ??
      this.asArray(raw.irdntTicket) ??
      [];

    if (ingredientItems.length === 0) {
      return null;
    }

    const facts: NutritionFacts = {
      energyKcal: null,
      carbohydrateG: null,
      proteinG: null,
      fatG: null,
      sugarG: null,
      sodiumMg: null,
    };

    for (const item of ingredientItems) {
      const record = this.asRecord(item);

      if (!record) {
        continue;
      }

      const name =
        this.readFirstString(record, ['irdnt_Nm', 'irdntNm', 'name']) ?? '';
      const unit =
        this.readFirstString(record, [
          'irdnt_Unit_Nm',
          'irdntUnitNm',
          'unit',
        ]) ?? '';
      const value = this.readFirstNumber(record, [
        'cont_Info',
        'contInfo',
        'content',
        'value',
      ]);

      if (value === null) {
        continue;
      }

      if (/에너지|열량/.test(name)) {
        facts.energyKcal = /kj/i.test(unit)
          ? Number((value / 4.184).toFixed(2))
          : value;
      } else if (/탄수화물/.test(name)) {
        facts.carbohydrateG = value;
      } else if (/단백질/.test(name)) {
        facts.proteinG = value;
      } else if (/지방/.test(name) && !/지방산|포화|불포화|트랜스/.test(name)) {
        facts.fatG = value;
      } else if (/당류|총당/.test(name)) {
        facts.sugarG = value;
      } else if (/나트륨/.test(name)) {
        facts.sodiumMg = value;
      }
    }

    return facts;
  }

  private isRelevantCandidate(normalizedInput: string, matchedName: string) {
    const normalizedMatchedName = normalizeFoodName(matchedName);

    return (
      normalizedMatchedName === normalizedInput ||
      normalizedMatchedName.includes(normalizedInput) ||
      normalizedInput.includes(normalizedMatchedName)
    );
  }

  private uniqueCandidates(candidates: FoodCandidate[]) {
    const seen = new Set<string>();

    return candidates.filter((candidate) => {
      const key = candidate.id ?? candidate.normalizedName;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private isStrongMatch(normalizedInput: string, matchedName: string) {
    return normalizeFoodName(matchedName) === normalizedInput;
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

  private readCsv(value: string) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
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
