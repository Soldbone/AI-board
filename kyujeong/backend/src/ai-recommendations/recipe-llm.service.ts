import { Injectable } from '@nestjs/common';
import type { IngredientSetAnalysis } from '../food-metadata/food-metadata.types';
import {
  AI_RECOMMENDATION_GOAL_INSTRUCTIONS,
  AI_RECOMMENDATION_GOAL_LABELS,
  DEFAULT_AI_RECOMMENDATION_GOAL,
  normalizeAiRecommendationGoals,
  type AiRecommendationGoal,
} from './recommendation-goal';

export type RecipeRecommendationDraft = {
  menuName: string;
  reason: string;
  availableIngredients: string[];
  usedIngredients?: string[];
  missingIngredients: string[];
  estimatedCookingTime: number | null;
  difficulty: string;
  content: string;
};

export type RecommendationGrounding = 'COMMUNITY_RAG' | 'GENERAL_AI';

type RecipeContext = {
  title: string;
  content: string;
  tags: string[];
  availableIngredients?: string[];
};

type SimilarPostContext = {
  title: string;
  category?: string;
  sourceType?: string;
  summary: string;
  questionSummary?: string;
  commentEvidence?: string[];
  tags: string[];
  similarity: number;
  semanticSimilarity?: number;
  ingredients?: string[];
  matchedIngredients?: string[];
  missingIngredients?: string[];
};

@Injectable()
export class RecipeLlmService {
  async createRecommendation(
    targetPost: RecipeContext,
    similarPosts: SimilarPostContext[],
    grounding: RecommendationGrounding = 'COMMUNITY_RAG',
    nutritionMetadata: IngredientSetAnalysis | null = null,
    recommendationGoals: AiRecommendationGoal | AiRecommendationGoal[] =
      DEFAULT_AI_RECOMMENDATION_GOAL,
  ): Promise<RecipeRecommendationDraft> {
    const normalizedGoals = normalizeAiRecommendationGoals(recommendationGoals);

    const openAiApiKey = process.env.OPENAI_API_KEY;

    if (openAiApiKey) {
      const generatedRecommendation = await this.createOpenAiRecommendation(
        targetPost,
        similarPosts,
        grounding,
        nutritionMetadata,
        normalizedGoals,
        openAiApiKey,
      );

      if (generatedRecommendation) {
        return generatedRecommendation;
      }
    }

    return this.createFallbackRecommendation(
      targetPost,
      similarPosts,
      grounding,
      nutritionMetadata,
      normalizedGoals,
    );
  }

  private async createOpenAiRecommendation(
    targetPost: RecipeContext,
    similarPosts: SimilarPostContext[],
    grounding: RecommendationGrounding,
    nutritionMetadata: IngredientSetAnalysis | null,
    recommendationGoals: AiRecommendationGoal[],
    openAiApiKey: string,
  ) {
    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
            temperature: 0.3,
            messages: [
              {
                role: 'system',
                content:
                  'You recommend practical Korean home recipes. Return only valid JSON.',
              },
              {
                role: 'user',
                content: this.buildPrompt(
                  targetPost,
                  similarPosts,
                  grounding,
                  nutritionMetadata,
                  recommendationGoals,
                ),
              },
            ],
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(25000),
        },
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return null;
      }

      return this.parseRecommendationJson(content);
    } catch {
      return null;
    }
  }

  private buildPrompt(
    targetPost: RecipeContext,
    similarPosts: SimilarPostContext[],
    grounding: RecommendationGrounding,
    nutritionMetadata: IngredientSetAnalysis | null,
    recommendationGoals: AiRecommendationGoal[],
  ) {
    const isGeneralAi = grounding === 'GENERAL_AI';

    return JSON.stringify({
      task: isGeneralAi
        ? 'Recommend one recipe using the target post and general cooking knowledge because no similar community posts were found.'
        : 'Recommend one recipe using the target post and similar community posts as evidence.',
      grounding,
      outputSchema: {
        menuName: 'string',
        reason: 'string',
        availableIngredients: ['string'],
        usedIngredients: ['string'],
        missingIngredients: ['string'],
        estimatedCookingTime: 'number or null',
        difficulty: '쉬움 | 보통 | 어려움',
        content: 'string',
      },
      targetPost,
      recommendationGoals: recommendationGoals.map((goal) => ({
        code: goal,
        label: AI_RECOMMENDATION_GOAL_LABELS[goal],
        instruction: AI_RECOMMENDATION_GOAL_INSTRUCTIONS[goal],
      })),
      nutritionMetadata: nutritionMetadata
        ? this.summarizeNutritionMetadata(nutritionMetadata)
        : null,
      similarPosts: isGeneralAi ? [] : similarPosts,
      rules: [
        'Use Korean.',
        'Treat targetPost.availableIngredients as the user-owned ingredients when present.',
        'Prefer ingredients mentioned by the target post.',
        'availableIngredients must only include ingredients the user already has.',
        'usedIngredients must include every ingredient actually used in the final recommended recipe, including owned and missing ingredients.',
        'missingIngredients must be the ingredients from usedIngredients that are not present in targetPost.availableIngredients.',
        'Do not include serving sides, optional garnish, community-only ingredients, or general context words in usedIngredients unless they are actually used in content.',
        'Do not force missingIngredients. Return an empty array when the recipe works well with the available ingredients.',
        isGeneralAi
          ? 'Do not say that community posts were referenced.'
          : 'Use recipe-share, tip-review, and trend community posts as supporting evidence before question posts.',
        isGeneralAi
          ? 'Ignore similarPosts because they are intentionally omitted.'
          : 'Do not treat the question text itself as recipe evidence; it is only context for the commenter advice.',
        isGeneralAi
          ? 'Explain that the recommendation is based on the current request and general cooking knowledge.'
          : 'Explain the recommendation using community recipe content, tip content, reviews, and comment advice naturally.',
        'Use nutritionMetadata only as factual support for nutrition balance, not as the source of the dish choice.',
        'Prefer community RAG evidence over nutrition metadata when explaining why this dish was chosen.',
        'Mention simple nutrition points such as protein, carbohydrates, fat, sugar, or sodium only when the provided metadata supports them.',
        'Follow recommendationGoals as combined requested directions, but keep the recipe practical with the owned ingredients.',
        'Do not give medical, diet-treatment, disease, or weight-loss prescriptions.',
        'If sodium metadata is high, suggest mild seasoning in practical Korean.',
        'Do not invent too many missing ingredients.',
      ],
    });
  }

  private parseRecommendationJson(content: string): RecipeRecommendationDraft {
    const parsed = JSON.parse(content) as Partial<RecipeRecommendationDraft>;

    return {
      menuName: this.readString(parsed.menuName, '냉장고 재료 활용 볶음밥'),
      reason: this.readString(
        parsed.reason,
        '게시글의 재료와 조건을 기준으로 만들기 쉬운 메뉴입니다.',
      ),
      availableIngredients: this.readStringArray(parsed.availableIngredients),
      usedIngredients: this.readStringArray(parsed.usedIngredients),
      missingIngredients: this.readStringArray(parsed.missingIngredients),
      estimatedCookingTime:
        typeof parsed.estimatedCookingTime === 'number'
          ? parsed.estimatedCookingTime
          : null,
      difficulty: this.readString(parsed.difficulty, '쉬움'),
      content: this.readString(
        parsed.content,
        '가진 재료를 먼저 볶고 간을 맞춘 뒤 따뜻할 때 드세요.',
      ),
    };
  }

  private createFallbackRecommendation(
    targetPost: RecipeContext,
    similarPosts: SimilarPostContext[],
    grounding: RecommendationGrounding,
    nutritionMetadata: IngredientSetAnalysis | null,
    recommendationGoals: AiRecommendationGoal[],
  ): RecipeRecommendationDraft {
    const ingredients = this.extractIngredients(targetPost);
    const primaryIngredient =
      ingredients[0] ?? targetPost.tags[0] ?? '남은 재료';
    const menuName = this.pickFallbackMenuName(primaryIngredient, targetPost);
    const hasSimilarPosts =
      grounding === 'COMMUNITY_RAG' && similarPosts.length > 0;
    const nutritionPoint = this.buildNutritionPoint(nutritionMetadata);
    const goalPoint = this.buildGoalPoint(
      recommendationGoals,
      nutritionMetadata,
    );

    return {
      menuName,
      reason: [
        hasSimilarPosts
          ? `비슷한 게시글에서 ${primaryIngredient}를 빠르게 활용하는 흐름이 보여서, 현재 재료로 부담 없이 만들 수 있는 메뉴로 추천합니다.`
          : `아직 참고할 만한 유사 게시글이 적어서, 현재 글에 적힌 재료와 조건을 중심으로 간단한 메뉴를 추천합니다.`,
        goalPoint,
        nutritionPoint,
      ]
        .filter(Boolean)
        .join(' '),
      availableIngredients: ingredients.slice(0, 6),
      usedIngredients: ingredients.slice(0, 6),
      missingIngredients: [],
      estimatedCookingTime: this.extractMinutes(targetPost.content) ?? 10,
      difficulty: '쉬움',
      content: [
        `${primaryIngredient}를 중심으로 가진 재료를 한입 크기로 준비한 뒤, 팬에 볶거나 데워서 간을 맞춰보세요. 밥이나 면이 있다면 함께 넣어 한 끼 메뉴로 만들기 좋습니다.`,
        this.shouldMentionMildSeasoning(nutritionMetadata)
          ? '나트륨이 높은 재료가 포함될 수 있으니 간장이나 소금은 마지막에 조금씩 더해 간을 맞추는 쪽이 좋습니다.'
          : '',
        this.buildGoalCookingTip(recommendationGoals),
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  private summarizeNutritionMetadata(metadata: IngredientSetAnalysis) {
    return {
      dataSource: metadata.dataSource,
      matchStatus: metadata.matchStatus,
      ingredients: metadata.ingredients.map((ingredient) => ({
        originalInput: ingredient.originalInput,
        matchedName: ingredient.matchedName,
        servingSize: ingredient.servingSize,
        matchStatus: ingredient.matchStatus,
        nutrition: ingredient.nutrition,
      })),
      notes: metadata.notes,
    };
  }

  private buildNutritionPoint(metadata: IngredientSetAnalysis | null) {
    if (!metadata) {
      return '';
    }

    const proteinIngredients = metadata.ingredients
      .filter(
        (ingredient) =>
          typeof ingredient.nutrition.proteinG === 'number' &&
          ingredient.nutrition.proteinG >= 5,
      )
      .map(
        (ingredient) => ingredient.matchedName ?? ingredient.normalizedInput,
      );

    if (proteinIngredients.length > 0) {
      return `${proteinIngredients.slice(0, 2).join(', ')}에 단백질이 있어 한 끼의 포만감을 보강하기 좋습니다.`;
    }

    if (this.shouldMentionMildSeasoning(metadata)) {
      return '나트륨이 높은 재료가 포함될 수 있어 양념은 약하게 잡는 편이 좋습니다.';
    }

    return '';
  }

  private buildGoalPoint(
    recommendationGoals: AiRecommendationGoal[],
    metadata: IngredientSetAnalysis | null,
  ) {
    const points = recommendationGoals
      .map((goal) => {
        switch (goal) {
          case 'HIGH_PROTEIN':
            return metadata
              ? '고단백 목표에 맞춰 단백질이 잡히는 재료를 중심으로 구성합니다.'
              : '고단백 목표에 맞춰 단백질 재료를 우선 활용합니다.';
          case 'LIGHT':
            return '가볍게 먹는 목표에 맞춰 기름과 밥 또는 면의 양을 줄이는 방향으로 추천합니다.';
          case 'LOW_SODIUM':
            return '나트륨을 낮추는 목표에 맞춰 짠 양념은 마지막에 조금만 쓰는 방향으로 추천합니다.';
          case 'FILLING':
            return '든든한 한 끼 목표에 맞춰 포만감 있는 조합으로 추천합니다.';
          case 'QUICK':
            return '빠르게 만들 수 있도록 손질과 조리 단계가 적은 메뉴로 추천합니다.';
          case 'BUDGET':
            return '저렴하게 먹는 목표에 맞춰 가진 재료를 우선 쓰고 추가 구매를 줄이는 방향으로 추천합니다.';
          case 'LOW_CALORIE':
            return '칼로리를 낮추는 목표에 맞춰 기름과 탄수화물 양을 줄이는 방향으로 추천합니다.';
          case 'MORE_VEGETABLES':
            return '채소를 많이 쓰는 목표에 맞춰 보유한 채소를 넉넉히 활용합니다.';
          case 'BALANCED':
          default:
            return '';
        }
      })
      .filter(Boolean);

    return points.join(' ');
  }

  private buildGoalCookingTip(recommendationGoals: AiRecommendationGoal[]) {
    const tips = recommendationGoals
      .map((goal) => {
        switch (goal) {
          case 'HIGH_PROTEIN':
            return '계란, 두부, 참치처럼 가진 단백질 재료가 있다면 양을 조금 넉넉히 잡아도 좋습니다.';
          case 'LIGHT':
          case 'LOW_CALORIE':
            return '팬에 볶을 때는 기름을 적게 두르고, 밥이나 면은 곁들이는 정도로 줄이면 가볍게 먹기 좋습니다.';
          case 'LOW_SODIUM':
            return '김치나 햄처럼 짠 재료가 있다면 양념을 먼저 넣지 말고 마지막에 맛을 보고 조절하세요.';
          case 'FILLING':
            return '밥이나 면을 곁들이고 채소를 함께 넣으면 한 끼로 더 든든해집니다.';
          case 'QUICK':
            return '재료는 크게 썰고 팬 하나로 끝내면 조리 시간을 줄이기 좋습니다.';
          case 'BUDGET':
            return '새 재료를 많이 사기보다 남은 재료와 기본 양념으로 맛을 맞추는 쪽이 좋습니다.';
          case 'MORE_VEGETABLES':
            return '채소는 숨이 죽으면 양이 줄어드니 처음부터 조금 넉넉히 넣어도 좋습니다.';
          case 'BALANCED':
          default:
            return '';
        }
      })
      .filter(Boolean);

    return [...new Set(tips)].join(' ');
  }

  private shouldMentionMildSeasoning(metadata: IngredientSetAnalysis | null) {
    if (!metadata) {
      return false;
    }

    return metadata.ingredients.some(
      (ingredient) =>
        typeof ingredient.nutrition.sodiumMg === 'number' &&
        ingredient.nutrition.sodiumMg >= 600,
    );
  }

  private extractIngredients(targetPost: RecipeContext) {
    if (targetPost.availableIngredients?.length) {
      return targetPost.availableIngredients;
    }

    const text = `${targetPost.title} ${targetPost.content}`;
    const candidates = [
      ...targetPost.tags,
      ...text
        .replace(/[^\p{L}\p{N},\s]/gu, ' ')
        .split(/[,\s]+/)
        .map((token) => token.trim()),
    ];
    const stopWords = new Set([
      '추천',
      '해주세요',
      '있어요',
      '있습니다',
      '냉장고',
      '요리',
      '메뉴',
      '저녁',
      '점심',
      '아침',
      '간단',
      '간단요리',
    ]);

    return [...new Set(candidates)]
      .filter((token) => token.length >= 2 && token.length <= 12)
      .filter((token) => !stopWords.has(token))
      .slice(0, 8);
  }

  private pickFallbackMenuName(
    primaryIngredient: string,
    targetPost: RecipeContext,
  ) {
    const text = `${targetPost.title} ${targetPost.content}`;

    if (text.includes('밥') || text.includes('김치') || text.includes('계란')) {
      return `${primaryIngredient} 볶음밥`;
    }

    if (text.includes('국') || text.includes('찌개')) {
      return `${primaryIngredient} 간단국`;
    }

    if (text.includes('면') || text.includes('파스타')) {
      return `${primaryIngredient} 볶음면`;
    }

    return `${primaryIngredient} 냉파 한 접시`;
  }

  private extractMinutes(content: string) {
    const match = content.match(/(\d+)\s*분/);

    return match ? Number(match[1]) : null;
  }

  private readString(value: unknown, fallback: string) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  private readStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
  }
}
