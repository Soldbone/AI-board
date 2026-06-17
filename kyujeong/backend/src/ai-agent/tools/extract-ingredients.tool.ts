import { Injectable } from '@nestjs/common';
import type {
  DraftSignals,
  PostDraftAgentInput,
} from '../post-draft-agent.types';

export type ExtractIngredientsResult = {
  ingredients: string[];
  signals: DraftSignals;
  missingInfoQuestions: string[];
};

type OpenAiIngredientExtractionResponse = {
  ingredients?: unknown;
};

const KNOWN_INGREDIENTS = [
  '계란',
  '달걀',
  '김치',
  '양파',
  '대파',
  '파',
  '마늘',
  '두부',
  '순두부',
  '참치',
  '참치캔',
  '스팸',
  '햄',
  '소시지',
  '닭가슴살',
  '닭고기',
  '돼지고기',
  '소고기',
  '고추장',
  '된장',
  '간장',
  '밥',
  '쌀밥',
  '면',
  '라면',
  '파스타',
  '우유',
  '치즈',
  '버터',
  '감자',
  '고구마',
  '당근',
  '애호박',
  '버섯',
  '콩나물',
  '숙주',
  '오이',
  '토마토',
  '상추',
  '양배추',
  '브로콜리',
  '새우',
  '오징어',
  '고등어',
  '연어',
  '만두',
  '떡',
  '어묵',
  '김',
  '미역',
  '고추',
  '청양고추',
];

const INGREDIENT_ALIASES = new Map<string, string>([
  ['달걀', '계란'],
  ['파', '대파'],
  ['순두부', '두부'],
  ['참치캔', '참치'],
  ['쌀밥', '밥'],
]);

@Injectable()
export class ExtractIngredientsTool {
  async run(input: PostDraftAgentInput): Promise<ExtractIngredientsResult> {
    const text = `${input.title ?? ''} ${input.content ?? ''} ${
      input.additionalRequest ?? ''
    }`;
    const ruleBasedIngredients = this.extractIngredients(text);
    const llmIngredients = await this.extractIngredientsWithLlmWhenNeeded(
      text,
      ruleBasedIngredients,
    );
    const ingredients = this.mergeIngredients(
      ruleBasedIngredients,
      llmIngredients,
    );
    const signals = this.extractSignals(text);
    const missingInfoQuestions = this.buildMissingInfoQuestions(
      text,
      ingredients,
      signals,
    );

    return {
      ingredients,
      signals,
      missingInfoQuestions,
    };
  }

  private extractIngredients(text: string) {
    const normalizedText = text.replace(/\s+/g, ' ');
    const normalizedTokens = normalizedText
      .replace(/[^\p{L}\p{N},\s]/gu, ' ')
      .split(/[,\s]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const matchedIngredients = KNOWN_INGREDIENTS.filter(
      (ingredient) =>
        normalizedTokens.includes(ingredient) ||
        (ingredient.length > 1 && normalizedText.includes(ingredient)),
    ).map((ingredient) => INGREDIENT_ALIASES.get(ingredient) ?? ingredient);
    const commaTokens = normalizedText
      .replace(/[^\p{L}\p{N},\s]/gu, ' ')
      .split(/[,\n]/)
      .flatMap((token) =>
        token.split(/\s+(?:있고|있어요|있습니다|랑|하고|와|과)\s*/),
      )
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => token.length >= 2 && token.length <= 12)
      .filter((token) => this.isLikelyIngredientToken(token));

    return this.mergeIngredients(matchedIngredients, commaTokens);
  }

  private async extractIngredientsWithLlmWhenNeeded(
    text: string,
    ruleBasedIngredients: string[],
  ) {
    const openAiApiKey = process.env.OPENAI_API_KEY;

    if (
      !openAiApiKey ||
      !this.shouldUseLlmFallback(text, ruleBasedIngredients)
    ) {
      return [];
    }

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
            temperature: 0,
            messages: [
              {
                role: 'system',
                content:
                  'Extract only food ingredients the Korean user says they already have. Return only valid JSON.',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  outputSchema: { ingredients: ['string'] },
                  text,
                  rules: [
                    'Use short Korean base ingredient names.',
                    'Exclude cooking actions, recipe names, meal times, preferences, quantities, and requests.',
                    'Do not include words like 만들고, 먹고, 추천, 요리, 메뉴, 냉장고.',
                    'If no owned ingredients are clearly stated, return an empty array.',
                    'Return at most 8 ingredients.',
                  ],
                }),
              },
            ],
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(12000),
        },
      );

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return [];
      }

      const parsed = JSON.parse(content) as OpenAiIngredientExtractionResponse;

      return this.readIngredientArray(parsed.ingredients);
    } catch {
      return [];
    }
  }

  private shouldUseLlmFallback(text: string, ingredients: string[]) {
    const meaningfulTextLength = text.replace(/\s/g, '').length;
    const hasListSignal =
      /[,，]/.test(text) ||
      /(냉장고에|집에|재료|있어요|있습니다|있고|남았|가지고|갖고)/.test(text);
    const hasSuspiciousIngredient = ingredients.some((ingredient) =>
      this.looksLikeActionOrRequest(ingredient),
    );

    return (
      meaningfulTextLength >= 12 &&
      (ingredients.length < 2 || hasSuspiciousIngredient) &&
      hasListSignal
    );
  }

  private readIngredientArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(
        (ingredient): ingredient is string => typeof ingredient === 'string',
      )
      .map((ingredient) => ingredient.trim())
      .filter((ingredient) => this.isLikelyIngredientToken(ingredient));
  }

  private mergeIngredients(...ingredientGroups: string[][]) {
    return [
      ...new Set(
        ingredientGroups
          .flat()
          .map((ingredient) => ingredient.trim())
          .filter((ingredient) => this.isLikelyIngredientToken(ingredient))
          .map(
            (ingredient) => INGREDIENT_ALIASES.get(ingredient) ?? ingredient,
          ),
      ),
    ].slice(0, 8);
  }

  private extractSignals(text: string): DraftSignals {
    const minuteMatch = text.match(/(\d{1,3})\s*분/);
    const mealContext =
      ['아침', '점심', '저녁', '야식', '도시락', '간식'].find((keyword) =>
        text.includes(keyword),
      ) ?? null;
    const tastePreference =
      [
        '매운맛',
        '매콤',
        '담백',
        '고소',
        '싱겁',
        '저염',
        '든든',
        '가볍',
        '국물',
      ].find((keyword) => text.includes(keyword)) ?? null;

    return {
      timePreference: minuteMatch ? `${minuteMatch[1]}분` : null,
      mealContext,
      tastePreference,
    };
  }

  private buildMissingInfoQuestions(
    text: string,
    ingredients: string[],
    signals: DraftSignals,
  ) {
    const questions: string[] = [];
    const meaningfulTextLength = text.replace(/\s/g, '').length;

    if (ingredients.length < 2) {
      questions.push('지금 가지고 있는 재료를 2개 이상 알려주세요.');
    }

    if (!signals.timePreference && meaningfulTextLength < 40) {
      questions.push('몇 분 안에 만들고 싶은지도 알려주면 더 정확해져요.');
    }

    if (
      !signals.mealContext &&
      !signals.tastePreference &&
      meaningfulTextLength < 50
    ) {
      questions.push(
        '저녁, 도시락, 매운맛처럼 상황이나 취향을 하나만 더 적어주세요.',
      );
    }

    return questions;
  }

  private isStopWord(token: string) {
    return [
      '냉장고',
      '재료',
      '요리',
      '메뉴',
      '추천',
      '해주세요',
      '있어요',
      '있습니다',
      '간단',
      '빠르게',
      '먹고',
      '먹으면',
      '만들고',
      '만들어',
      '만들면',
      '만들기',
      '해먹고',
      '해먹으면',
      '조리',
      '늦게',
      '들어와서',
      '들어오기',
      '들어오면',
      '나가기',
      '나가서',
      '나가면',
      '외출',
      '퇴근',
      '출근',
      '싶어요',
    ].some((stopWord) => token.includes(stopWord));
  }

  private isLikelyIngredientToken(token: string) {
    return (
      token.length >= 2 &&
      token.length <= 12 &&
      !this.isStopWord(token) &&
      !this.looksLikeActionOrRequest(token)
    );
  }

  private looksLikeActionOrRequest(token: string) {
    return /(만들|먹|해먹|추천|요리|조리|볶|끓|굽|썰|넣|남았|가지고|갖고|들어오|들어와|나가|외출|퇴근|출근|싶|주세요|해줘)(고|어|아서|와서|으면|는데|다|기|게|요)?$/.test(
      token,
    );
  }
}
