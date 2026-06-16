import { Injectable } from '@nestjs/common';
import type { DraftSignals, PostDraftAgentInput } from '../post-draft-agent.types';

export type ExtractIngredientsResult = {
  ingredients: string[];
  signals: DraftSignals;
  missingInfoQuestions: string[];
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
  run(input: PostDraftAgentInput): ExtractIngredientsResult {
    const text = `${input.title ?? ''} ${input.content ?? ''} ${
      input.additionalRequest ?? ''
    }`;
    const ingredients = this.extractIngredients(text);
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
    const matchedIngredients = KNOWN_INGREDIENTS.filter((ingredient) =>
      normalizedText.includes(ingredient),
    ).map((ingredient) => INGREDIENT_ALIASES.get(ingredient) ?? ingredient);
    const commaTokens = normalizedText
      .replace(/[^\p{L}\p{N},\s]/gu, ' ')
      .split(/[,\n]/)
      .flatMap((token) => token.split(/\s+(?:있고|있어요|있습니다|랑|하고|와|과)\s*/))
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => token.length >= 2 && token.length <= 12)
      .filter((token) => !this.isStopWord(token));

    return [...new Set([...matchedIngredients, ...commaTokens])].slice(0, 8);
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

    if (!signals.mealContext && !signals.tastePreference && meaningfulTextLength < 50) {
      questions.push('저녁, 도시락, 매운맛처럼 상황이나 취향을 하나만 더 적어주세요.');
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
      '싶어요',
    ].some((stopWord) => token.includes(stopWord));
  }
}
