import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommentType } from '../../common/enums/ai-status.enum';
import { ModerationStatus } from '../../common/enums/comment-status.enum';
import {
  CommentAnalysisResult,
  CommentAnalyzerError,
  CommentAnalyzerProvider,
  RuleBasedCommentAnalyzerProvider,
} from './comment-analyzer.provider';

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

type OpenAiCommentAnalysisPayload = {
  commentType?: string;
  moderationStatus?: string;
};

const DEFAULT_COMMENT_ANALYSIS_MODEL = 'gpt-4.1-mini';
const DEFAULT_COMMENT_ANALYSIS_TIMEOUT_MS = 8000;

const COMMENT_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    commentType: {
      type: 'string',
      enum: Object.values(CommentType),
    },
    moderationStatus: {
      type: 'string',
      enum: [ModerationStatus.NORMAL, ModerationStatus.NEEDS_REVIEW],
    },
  },
  required: ['commentType', 'moderationStatus'],
};

@Injectable()
export class OpenAiCommentAnalyzerProvider implements CommentAnalyzerProvider {
  private readonly logger = new Logger(OpenAiCommentAnalyzerProvider.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly fallbackProvider: RuleBasedCommentAnalyzerProvider,
  ) {}

  async analyze(content: string): Promise<CommentAnalysisResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      return this.fallbackProvider.analyze(content);
    }

    try {
      return await this.analyzeWithOpenAi(apiKey, content);
    } catch (error) {
      this.logger.warn(
        `OpenAI comment analysis failed. Falling back to rule-based analyzer: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return this.fallbackProvider.analyze(content);
    }
  }

  private async analyzeWithOpenAi(apiKey: string, content: string): Promise<CommentAnalysisResult> {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: AbortSignal.timeout(this.getTimeoutMs()),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:
          this.configService.get<string>('COMMENT_ANALYSIS_MODEL') ??
          DEFAULT_COMMENT_ANALYSIS_MODEL,
        instructions: this.createInstructions(),
        input: content,
        max_output_tokens: 200,
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'comment_analysis',
            strict: true,
            schema: COMMENT_ANALYSIS_SCHEMA,
          },
        },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as OpenAiResponsesApiResponse;

    if (!response.ok) {
      throw new CommentAnalyzerError(
        'COMMENT_ANALYSIS_FAILED',
        'OpenAI 댓글 분석 API 호출에 실패했습니다.',
        body.error?.message,
      );
    }

    return this.parseAnalysisResponse(body);
  }

  private parseAnalysisResponse(body: OpenAiResponsesApiResponse): CommentAnalysisResult {
    const outputText = body.output_text ?? this.findOutputText(body);

    if (!outputText) {
      throw new CommentAnalyzerError(
        'COMMENT_ANALYSIS_FAILED',
        'OpenAI 댓글 분석 응답이 비어 있습니다.',
      );
    }

    const parsedPayload = JSON.parse(outputText) as OpenAiCommentAnalysisPayload;

    if (!this.isCommentType(parsedPayload.commentType)) {
      throw new CommentAnalyzerError(
        'COMMENT_ANALYSIS_FAILED',
        'OpenAI 댓글 유형 분석 응답이 올바르지 않습니다.',
      );
    }

    if (!this.isModerationStatus(parsedPayload.moderationStatus)) {
      throw new CommentAnalyzerError(
        'COMMENT_ANALYSIS_FAILED',
        'OpenAI 댓글 moderation 응답이 올바르지 않습니다.',
      );
    }

    return {
      commentType: parsedPayload.commentType,
      moderationStatus: parsedPayload.moderationStatus,
    };
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
      'You classify Korean or English discussion comments for Arena.',
      'Return only the requested JSON schema.',
      'Use FACT_CLAIM only when the comment asserts a checkable factual claim.',
      'Use OPINION for subjective evaluation or preference.',
      'Use QUESTION for questions.',
      'Use TOXIC for insults, threats, harassment, or personal attacks.',
      'Use CHITCHAT for short reactions or comments that do not fit the other types.',
      'Set moderationStatus to NEEDS_REVIEW for TOXIC comments, otherwise NORMAL.',
      'Do not decide whether factual claims are true or false.',
    ].join('\n');
  }

  private getTimeoutMs(): number {
    const configuredTimeout = Number(
      this.configService.get<string>('COMMENT_ANALYSIS_TIMEOUT_MS') ??
        DEFAULT_COMMENT_ANALYSIS_TIMEOUT_MS,
    );

    return Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : DEFAULT_COMMENT_ANALYSIS_TIMEOUT_MS;
  }

  private isCommentType(value: string | undefined): value is CommentType {
    return Boolean(value && Object.values(CommentType).includes(value as CommentType));
  }

  private isModerationStatus(value: string | undefined): value is ModerationStatus {
    return value === ModerationStatus.NORMAL || value === ModerationStatus.NEEDS_REVIEW;
  }
}
