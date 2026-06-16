import { Injectable } from '@nestjs/common';
import { FoodMetadataService } from '../../food-metadata/food-metadata.service';
import type { IngredientSetAnalysis } from '../../food-metadata/food-metadata.types';

export type AnalyzeFoodMetadataResult = {
  analysis: IngredientSetAnalysis | null;
  summary: string | null;
};

@Injectable()
export class AnalyzeFoodMetadataTool {
  constructor(private readonly foodMetadataService: FoodMetadataService) {}

  async run(ingredients: string[]): Promise<AnalyzeFoodMetadataResult> {
    if (ingredients.length === 0) {
      return {
        analysis: null,
        summary: null,
      };
    }

    const analysis = await this.foodMetadataService.analyzeIngredientsNutrition(
      ingredients.slice(0, 6),
    );

    return {
      analysis,
      summary: this.buildSummary(analysis),
    };
  }

  private buildSummary(analysis: IngredientSetAnalysis) {
    if (
      analysis.matchStatus === 'configuration_missing' ||
      analysis.matchStatus === 'api_error' ||
      analysis.matchStatus === 'rate_limited'
    ) {
      return '공공데이터 식품영양성분 API 조회가 아직 안정적으로 완료되지 않아, 영양 정보는 보조 근거 없이 작성합니다.';
    }

    const matched = analysis.ingredients.filter(
      (ingredient) => ingredient.matchStatus === 'matched',
    );
    const proteinSources = matched
      .filter(
        (ingredient) =>
          typeof ingredient.nutrition.proteinG === 'number' &&
          ingredient.nutrition.proteinG >= 5,
      )
      .map((ingredient) => ingredient.matchedName ?? ingredient.normalizedInput);
    const sodiumSources = matched
      .filter(
        (ingredient) =>
          typeof ingredient.nutrition.sodiumMg === 'number' &&
          ingredient.nutrition.sodiumMg >= 600,
      )
      .map((ingredient) => ingredient.matchedName ?? ingredient.normalizedInput);
    const energy = analysis.totals.energyKcal;
    const parts: string[] = [];

    if (matched.length > 0) {
      parts.push(`${matched.length}개 재료가 식품영양성분 DB와 매칭됐습니다.`);
    }

    if (typeof energy === 'number') {
      parts.push(`확인 가능한 재료 기준 열량 합계는 약 ${energy}kcal입니다.`);
    }

    if (proteinSources.length > 0) {
      parts.push(
        `${proteinSources.slice(0, 2).join(', ')}는 단백질 보강 재료로 볼 수 있습니다.`,
      );
    }

    if (sodiumSources.length > 0) {
      parts.push(
        `${sodiumSources.slice(0, 2).join(', ')}는 나트륨이 높을 수 있어 간은 약하게 잡는 편이 좋습니다.`,
      );
    }

    return parts.length > 0
      ? parts.join(' ')
      : '매칭된 영양성분이 적어 식재료명과 조리 조건 중심으로 초안을 작성합니다.';
  }
}
