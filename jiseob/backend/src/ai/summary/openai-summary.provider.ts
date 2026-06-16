import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SummaryProvider,
  SummaryProviderError,
  SummaryProviderInput,
  SummaryProviderResult,
} from './summary.provider';

type OpenAiResponsesApiResponse = {
  error?: {
    message?: string;
  };
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type OpenAiSummaryPayload = {
  summaryText?: string;
};

const DEFAULT_SUMMARY_MODEL = 'gpt-4.1-mini';
const DEFAULT_SUMMARY_TIMEOUT_MS = 30000;
const DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS = 900;

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summaryText: {
      type: 'string',
    },
  },
  required: ['summaryText'],
};

@Injectable()
export class OpenAiSummaryProvider implements SummaryProvider {
  constructor(private readonly configService: ConfigService) {}

  async summarize(input: SummaryProviderInput): Promise<SummaryProviderResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();

    if (!apiKey) {
      throw new SummaryProviderError(
        'MISSING_OPENAI_API_KEY',
        'OpenAI API key가 설정되지 않아 댓글 요약을 생성하지 못했습니다.',
      );
    }

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: AbortSignal.timeout(this.getTimeoutMs()),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.getModel(),
          instructions: this.createInstructions(),
          input: JSON.stringify(this.toPromptInput(input)),
          max_output_tokens: this.getMaxOutputTokens(),
          store: false,
          text: {
            format: {
              type: 'json_schema',
              name: 'comment_thread_summary',
              strict: true,
              schema: SUMMARY_SCHEMA,
            },
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as OpenAiResponsesApiResponse;

      if (!response.ok) {
        throw new SummaryProviderError(
          'SUMMARY_PROVIDER_FAILED',
          '댓글 요약 API 호출에 실패했습니다. 잠시 후 다시 시도해주세요.',
          body.error?.message,
        );
      }

      return this.parseSummaryResponse(body);
    } catch (error) {
      if (error instanceof SummaryProviderError) {
        throw error;
      }

      throw new SummaryProviderError(
        'SUMMARY_PROVIDER_FAILED',
        '댓글 요약 API 호출에 실패했습니다. 잠시 후 다시 시도해주세요.',
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  private parseSummaryResponse(body: OpenAiResponsesApiResponse): SummaryProviderResult {
    const outputText = body.output_text ?? this.findOutputText(body);

    if (!outputText) {
      throw new SummaryProviderError(
        'SUMMARY_PROVIDER_INVALID_RESPONSE',
        '댓글 요약 응답이 비어 있습니다.',
      );
    }

    let parsedPayload: OpenAiSummaryPayload;

    try {
      parsedPayload = JSON.parse(outputText) as OpenAiSummaryPayload;
    } catch (error) {
      throw new SummaryProviderError(
        'SUMMARY_PROVIDER_INVALID_RESPONSE',
        '댓글 요약 응답이 올바르지 않습니다.',
        error instanceof Error ? error.message : undefined,
      );
    }

    const summaryText = parsedPayload.summaryText?.trim();

    if (!summaryText) {
      throw new SummaryProviderError(
        'SUMMARY_PROVIDER_INVALID_RESPONSE',
        '댓글 요약 응답에 요약 내용이 없습니다.',
      );
    }

    return { summaryText };
  }

  private findOutputText(body: OpenAiResponsesApiResponse): string | null {
    for (const outputItem of body.output ?? []) {
      for (const contentItem of outputItem.content ?? []) {
        if (contentItem.type === 'output_text' && contentItem.text) {
          return contentItem.text;
        }
      }
    }

    return null;
  }

  private createInstructions(): string {
    return [
      'You summarize one Arena comment thread in Korean.',
      'Organize the summary with these short sections: 핵심 요약, 주요 쟁점, 서로 다른 입장, 확인 한계.',
      'Do not judge claims as true or false. Describe transcript or comment claims as discussion context only.',
      'Do not infer deleted comment content. If deletion changed the thread, mention only that the active thread changed.',
      'Return schema JSON only.',
    ].join('\n');
  }

  private toPromptInput(input: SummaryProviderInput): Record<string, unknown> {
    return {
      rootCommentId: input.rootCommentId,
      postId: input.postId,
      mode: input.mode,
      previousSummaryText: input.previousSummaryText,
      changeNote: input.changeNote,
      comments: input.comments.map((comment) => ({
        id: comment.id,
        authorNickname: comment.authorNickname,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        isRoot: comment.isRoot,
      })),
    };
  }

  private getModel(): string {
    return this.configService.get<string>('SUMMARY_MODEL') ?? DEFAULT_SUMMARY_MODEL;
  }

  private getTimeoutMs(): number {
    const configuredTimeout = Number(
      this.configService.get<string>('SUMMARY_TIMEOUT_MS') ?? DEFAULT_SUMMARY_TIMEOUT_MS,
    );

    return Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : DEFAULT_SUMMARY_TIMEOUT_MS;
  }

  private getMaxOutputTokens(): number {
    const configuredMaxOutputTokens = Number(
      this.configService.get<string>('SUMMARY_MAX_OUTPUT_TOKENS') ??
        DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS,
    );

    return Number.isFinite(configuredMaxOutputTokens) && configuredMaxOutputTokens > 0
      ? configuredMaxOutputTokens
      : DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS;
  }
}
