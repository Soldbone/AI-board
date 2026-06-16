import {
  FoodCandidate,
  FoodDataClient,
  FoodDataClientSearchOptions,
  FoodSearchResult,
} from './food-metadata.types';

const SOURCE_NAME = '재료별 영양 데이터';

export class CompositeFoodDataClient implements FoodDataClient {
  constructor(
    private readonly primaryClient: FoodDataClient,
    private readonly fallbackClient: FoodDataClient,
  ) {}

  async search(options: FoodDataClientSearchOptions): Promise<FoodSearchResult> {
    const primaryResult = await this.primaryClient.search(options);

    if (this.canUsePrimaryResult(primaryResult)) {
      return this.withCompositeSource(primaryResult);
    }

    const fallbackResult = await this.fallbackClient.search(options);

    if (fallbackResult.candidates.length === 0) {
      return this.withCompositeSource(
        primaryResult.matchStatus === 'configuration_missing'
          ? fallbackResult
          : primaryResult,
      );
    }

    return this.withCompositeSource(fallbackResult);
  }

  private canUsePrimaryResult(result: FoodSearchResult) {
    return (
      result.candidates.some((candidate) => candidate.matchStatus === 'matched') ||
      this.hasUsableCandidates(result.candidates)
    );
  }

  private hasUsableCandidates(candidates: FoodCandidate[]) {
    return candidates.some((candidate) =>
      Object.values(candidate.nutrition).some(
        (value) => typeof value === 'number',
      ),
    );
  }

  private withCompositeSource(result: FoodSearchResult): FoodSearchResult {
    return {
      ...result,
      source: SOURCE_NAME,
      candidates: result.candidates.map((candidate) => ({
        ...candidate,
        source: candidate.source,
      })),
    };
  }
}
