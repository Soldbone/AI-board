import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  FoodNutritionResult,
  FoodSearchResult,
  IngredientNutritionSummary,
  IngredientSetAnalysis,
  NutritionFacts,
} from './food-metadata.types';
import type { FoodDataClient } from './food-metadata.types';
import {
  buildFoodSearchQueries,
  normalizeFoodName,
} from './food-name-normalizer';
import { PublicDataFoodNutritionClient } from './public-data-food-nutrition.client';

const EMPTY_NUTRITION: NutritionFacts = {
  energyKcal: null,
  carbohydrateG: null,
  proteinG: null,
  fatG: null,
  sugarG: null,
  sodiumMg: null,
};

@Injectable()
export class FoodMetadataService {
  constructor(
    @Optional()
    @Inject('FOOD_DATA_CLIENT')
    private readonly foodDataClient: FoodDataClient = new PublicDataFoodNutritionClient(),
  ) {}

  async searchFoodItems(query: string, limit = 10): Promise<FoodSearchResult> {
    const queries = buildFoodSearchQueries(query);
    let firstResult: FoodSearchResult | null = null;

    for (const searchQuery of queries) {
      const result = await this.foodDataClient.search({
        query: searchQuery,
        limit,
      });

      if (!firstResult) {
        firstResult = {
          ...result,
          originalInput: query,
          normalizedInput: normalizeFoodName(query),
        };
      }

      if (
        result.matchStatus === 'configuration_missing' ||
        result.matchStatus === 'api_error' ||
        result.matchStatus === 'rate_limited'
      ) {
        return {
          ...result,
          originalInput: query,
          normalizedInput: normalizeFoodName(query),
        };
      }

      if (result.candidates.length > 0) {
        return {
          ...result,
          originalInput: query,
          normalizedInput: normalizeFoodName(query),
        };
      }
    }

    return (
      firstResult ?? {
        originalInput: query,
        normalizedInput: normalizeFoodName(query),
        candidates: [],
        totalCount: 0,
        source: '공공데이터포털 식품영양성분 API',
        matchStatus: 'not_found',
        message: 'No search query was provided.',
      }
    );
  }

  async getFoodNutrition(
    query: string,
    foodId?: string,
  ): Promise<FoodNutritionResult> {
    const searchResult = await this.searchFoodItems(query, 10);
    const item = foodId
      ? (searchResult.candidates.find((candidate) => candidate.id === foodId) ??
        null)
      : (searchResult.candidates[0] ?? null);
    const foodIdMissed = Boolean(foodId) && !item;

    return {
      originalInput: query,
      normalizedInput: normalizeFoodName(query),
      item,
      source: searchResult.source,
      matchStatus: foodIdMissed
        ? 'not_found'
        : (item?.matchStatus ?? searchResult.matchStatus),
      message: foodIdMissed
        ? `No food candidate matched foodId: ${foodId}.`
        : searchResult.message,
    };
  }

  async analyzeIngredientsNutrition(
    ingredients: string[],
  ): Promise<IngredientSetAnalysis> {
    const normalizedInputs = ingredients.map((ingredient) =>
      normalizeFoodName(ingredient),
    );
    const ingredientResults = await Promise.all(
      ingredients.map((ingredient) => this.getFoodNutrition(ingredient)),
    );
    const summaries = ingredientResults.map((result) =>
      this.toIngredientSummary(result),
    );
    const matchedSummaries = summaries.filter(
      (summary) => summary.matchStatus === 'matched',
    );
    const totals = this.sumNutrition(
      summaries.map((summary) => summary.nutrition),
    );
    const perIngredientAverage = this.averageNutrition(
      matchedSummaries.map((summary) => summary.nutrition),
    );

    return {
      originalInputs: ingredients,
      normalizedInputs,
      ingredients: summaries,
      totals,
      perIngredientAverage,
      dataSource: '공공데이터포털 식품영양성분 API',
      matchStatus:
        matchedSummaries.length === ingredients.length
          ? 'matched'
          : matchedSummaries.length > 0
            ? 'candidate'
            : summaries.some((summary) => summary.matchStatus === 'api_error')
              ? 'api_error'
              : summaries.some(
                    (summary) => summary.matchStatus === 'rate_limited',
                  )
                ? 'rate_limited'
                : summaries.some(
                      (summary) =>
                        summary.matchStatus === 'configuration_missing',
                    )
                  ? 'configuration_missing'
                  : 'not_found',
      notes: this.buildAnalysisNotes(summaries),
    };
  }

  private toIngredientSummary(
    result: FoodNutritionResult,
  ): IngredientNutritionSummary {
    return {
      originalInput: result.originalInput,
      normalizedInput: result.normalizedInput,
      matchedName: result.item?.matchedName ?? null,
      servingSize: result.item?.servingSize ?? null,
      nutrition: result.item?.nutrition ?? EMPTY_NUTRITION,
      matchStatus: result.matchStatus,
      message: result.message,
    };
  }

  private sumNutrition(nutritions: NutritionFacts[]): NutritionFacts {
    return {
      energyKcal: this.sumNullable(nutritions, 'energyKcal'),
      carbohydrateG: this.sumNullable(nutritions, 'carbohydrateG'),
      proteinG: this.sumNullable(nutritions, 'proteinG'),
      fatG: this.sumNullable(nutritions, 'fatG'),
      sugarG: this.sumNullable(nutritions, 'sugarG'),
      sodiumMg: this.sumNullable(nutritions, 'sodiumMg'),
    };
  }

  private averageNutrition(nutritions: NutritionFacts[]): NutritionFacts {
    if (nutritions.length === 0) {
      return EMPTY_NUTRITION;
    }

    const totals = this.sumNutrition(nutritions);

    return {
      energyKcal: this.divideNullable(totals.energyKcal, nutritions.length),
      carbohydrateG: this.divideNullable(
        totals.carbohydrateG,
        nutritions.length,
      ),
      proteinG: this.divideNullable(totals.proteinG, nutritions.length),
      fatG: this.divideNullable(totals.fatG, nutritions.length),
      sugarG: this.divideNullable(totals.sugarG, nutritions.length),
      sodiumMg: this.divideNullable(totals.sodiumMg, nutritions.length),
    };
  }

  private sumNullable(
    nutritions: NutritionFacts[],
    key: keyof NutritionFacts,
  ): number | null {
    const values = nutritions
      .map((nutrition) => nutrition[key])
      .filter((value): value is number => typeof value === 'number');

    if (values.length === 0) {
      return null;
    }

    return Number(values.reduce((sum, value) => sum + value, 0).toFixed(2));
  }

  private divideNullable(value: number | null, divisor: number) {
    return value === null ? null : Number((value / divisor).toFixed(2));
  }

  private buildAnalysisNotes(summaries: IngredientNutritionSummary[]) {
    const notes: string[] = [];
    const missing = summaries
      .filter((summary) => summary.matchStatus === 'not_found')
      .map((summary) => summary.originalInput);
    const apiErrors = summaries.filter(
      (summary) =>
        summary.matchStatus === 'api_error' ||
        summary.matchStatus === 'rate_limited' ||
        summary.matchStatus === 'configuration_missing',
    );

    if (missing.length > 0) {
      notes.push(`No food metadata was found for: ${missing.join(', ')}`);
    }

    if (apiErrors.length > 0) {
      notes.push(
        'Some ingredients could not be checked against the public API.',
      );
    }

    notes.push(
      'This metadata is factual support only; community RAG remains responsible for final menu judgment.',
    );

    return notes;
  }
}
