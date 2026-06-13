import { Injectable } from '@nestjs/common';

export type RecipeRecommendationDraft = {
  menuName: string;
  reason: string;
  availableIngredients: string[];
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
  ): Promise<RecipeRecommendationDraft> {
    const openAiApiKey = process.env.OPENAI_API_KEY;

    if (openAiApiKey) {
      const generatedRecommendation = await this.createOpenAiRecommendation(
        targetPost,
        similarPosts,
        grounding,
        openAiApiKey,
      );

      if (generatedRecommendation) {
        return generatedRecommendation;
      }
    }

    return this.createFallbackRecommendation(targetPost, similarPosts, grounding);
  }

  private async createOpenAiRecommendation(
    targetPost: RecipeContext,
    similarPosts: SimilarPostContext[],
    grounding: RecommendationGrounding,
    openAiApiKey: string,
  ) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: this.buildPrompt(targetPost, similarPosts, grounding),
            },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(25000),
      });

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
        missingIngredients: ['string'],
        estimatedCookingTime: 'number or null',
        difficulty: '쉬움 | 보통 | 어려움',
        content: 'string',
      },
      targetPost,
      similarPosts: isGeneralAi ? [] : similarPosts,
      rules: [
        'Use Korean.',
        'Treat targetPost.availableIngredients as the user-owned ingredients when present.',
        'Prefer ingredients mentioned by the target post.',
        'availableIngredients must only include ingredients the user already has.',
        'missingIngredients should list optional or necessary ingredients for the chosen recipe that the user does not appear to have.',
        'Do not force missingIngredients. Return an empty array when the recipe works well with the available ingredients.',
        'If community evidence has missingIngredients, treat them as possible add-ons, not as already owned ingredients.',
        isGeneralAi
          ? 'Do not say that community posts were referenced.'
          : 'Use commentEvidence from the similar community posts as the supporting evidence.',
        isGeneralAi
          ? 'Ignore similarPosts because they are intentionally omitted.'
          : 'Do not treat the question text itself as recipe evidence; it is only context for the commenter advice.',
        isGeneralAi
          ? 'Explain that the recommendation is based on the current request and general cooking knowledge.'
          : 'Explain the recommendation using community comment advice naturally.',
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
  ): RecipeRecommendationDraft {
    const ingredients = this.extractIngredients(targetPost);
    const primaryIngredient = ingredients[0] ?? targetPost.tags[0] ?? '남은 재료';
    const menuName = this.pickFallbackMenuName(primaryIngredient, targetPost);
    const hasSimilarPosts =
      grounding === 'COMMUNITY_RAG' && similarPosts.length > 0;

    return {
      menuName,
      reason: hasSimilarPosts
        ? `비슷한 게시글에서 ${primaryIngredient}를 빠르게 활용하는 흐름이 보여서, 현재 재료로 부담 없이 만들 수 있는 메뉴로 추천합니다.`
        : `아직 참고할 만한 유사 게시글이 적어서, 현재 글에 적힌 재료와 조건을 중심으로 간단한 메뉴를 추천합니다.`,
      availableIngredients: ingredients.slice(0, 6),
      missingIngredients: this.pickMissingIngredients(
        targetPost,
        ingredients,
        similarPosts,
      ),
      estimatedCookingTime: this.extractMinutes(targetPost.content) ?? 10,
      difficulty: '쉬움',
      content: `${primaryIngredient}를 중심으로 가진 재료를 한입 크기로 준비한 뒤, 팬에 볶거나 데워서 간을 맞춰보세요. 밥이나 면이 있다면 함께 넣어 한 끼 메뉴로 만들기 좋습니다.`,
    };
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

  private pickFallbackMenuName(primaryIngredient: string, targetPost: RecipeContext) {
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

  private pickMissingIngredients(
    targetPost: RecipeContext,
    ingredients: string[],
    similarPosts: SimilarPostContext[],
  ) {
    const text = `${targetPost.title} ${targetPost.content}`;
    const ownedIngredients = new Set(ingredients);
    const evidenceMissingIngredients = similarPosts.flatMap((post) =>
      post.missingIngredients ?? [],
    );
    const missingIngredients = evidenceMissingIngredients.filter(
      (ingredient) => !ownedIngredients.has(ingredient),
    );

    if (!text.includes('밥') && !ingredients.includes('밥')) {
      missingIngredients.push('밥 또는 면');
    }

    if (!text.includes('간장') && !text.includes('소금')) {
      missingIngredients.push('기본 양념');
    }

    return [...new Set(missingIngredients)].slice(0, 3);
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
