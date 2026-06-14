import { Injectable } from '@nestjs/common';
import type {
  DraftSignals,
  PostDraftAgentInput,
} from '../post-draft-agent.types';
import type { IngredientSetAnalysis } from '../../food-metadata/food-metadata.types';

export type RewritePostDraftInput = {
  draft: PostDraftAgentInput;
  ingredients: string[];
  signals: DraftSignals;
  nutritionSummary: string | null;
  nutritionAnalysis: IngredientSetAnalysis | null;
};

export type RewritePostDraftResult = {
  suggestedTitle: string;
  suggestedBody: string;
  suggestedTags: string[];
  source: 'OPENAI' | 'FALLBACK';
};

@Injectable()
export class RewritePostDraftTool {
  async run(input: RewritePostDraftInput): Promise<RewritePostDraftResult> {
    const openAiApiKey = process.env.OPENAI_API_KEY;

    if (openAiApiKey) {
      const openAiResult = await this.tryOpenAiRewrite(input, openAiApiKey);

      if (openAiResult) {
        return openAiResult;
      }
    }

    return this.createFallbackDraft(input);
  }

  private async tryOpenAiRewrite(
    input: RewritePostDraftInput,
    openAiApiKey: string,
  ): Promise<RewritePostDraftResult | null> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
          temperature: 0.25,
          messages: [
            {
              role: 'system',
              content:
                'You help users write Korean board posts asking for recipe recommendations. Return only valid JSON.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                task: 'Rewrite this into a clear community post draft. Do not answer the recipe yourself.',
                outputSchema: {
                  suggestedTitle: 'string',
                  suggestedBody: 'string',
                  suggestedTags: ['string, max 5'],
                },
                input,
                rules: [
                  'Use Korean.',
                  'Keep the post as a question/request to the community.',
                  'Do not generate a complete recipe answer.',
                  'Mention ingredients, time, meal context, and taste preference when available.',
                  'Use nutritionSummary only as a factual support line, not as medical advice.',
                  'suggestedTags must be short Korean tags and at most 5 items.',
                ],
              }),
            },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(20000),
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

      const parsed = JSON.parse(content) as Partial<RewritePostDraftResult>;
      const suggestedTitle = this.readString(parsed.suggestedTitle);
      const suggestedBody = this.readString(parsed.suggestedBody);
      const suggestedTags = this.readStringArray(parsed.suggestedTags);

      if (!suggestedTitle || !suggestedBody) {
        return null;
      }

      return {
        suggestedTitle,
        suggestedBody,
        suggestedTags: suggestedTags.slice(0, 5),
        source: 'OPENAI',
      };
    } catch {
      return null;
    }
  }

  private createFallbackDraft(input: RewritePostDraftInput): RewritePostDraftResult {
    const ingredients = input.ingredients.length > 0 ? input.ingredients : ['남은 재료'];
    const primaryIngredients = ingredients.slice(0, 3).join(', ');
    const time = input.signals.timePreference ?? '가능한 짧은 시간';
    const mealContext = input.signals.mealContext ?? '한 끼';
    const taste = input.signals.tastePreference ?? '부담 없는 맛';
    const additionalRequest = input.draft.additionalRequest?.trim();
    const nutritionLine = input.nutritionSummary
      ? `\n\nMCP로 확인한 식재료 메타데이터: ${input.nutritionSummary}`
      : '';

    return {
      suggestedTitle: `${primaryIngredients}로 ${time} ${mealContext} 메뉴 추천해주세요`,
      suggestedBody: [
        `냉장고에 ${primaryIngredients}가 있어요.`,
        `${time} 안에 ${mealContext}로 먹기 좋은 ${taste} 메뉴를 추천받고 싶습니다.`,
        additionalRequest ? `추가로 원하는 점은 ${additionalRequest}입니다.` : '',
        '가진 재료를 최대한 활용하고, 꼭 필요한 추가 재료가 있다면 적게 알려주세요.',
        nutritionLine,
      ]
        .filter(Boolean)
        .join('\n'),
      suggestedTags: this.buildFallbackTags(input),
      source: 'FALLBACK',
    };
  }

  private buildFallbackTags(input: RewritePostDraftInput) {
    const tags = [
      ...input.ingredients.slice(0, 2),
      input.signals.timePreference ? `${input.signals.timePreference}요리` : '간단요리',
      input.signals.mealContext,
      input.signals.tastePreference,
    ].filter((tag): tag is string => Boolean(tag));

    return [...new Set(tags)].slice(0, 5);
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  private readStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
