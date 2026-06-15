import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AgentToolObservation = {
  toolName: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  structuredContent?: unknown;
  contentText?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type AgentModelInput = {
  postId: string;
  question: string;
  observations: AgentToolObservation[];
  availableTools: string[];
  finalOnly: boolean;
};

export type AgentModelDecision =
  | {
      type: 'tool_call';
      toolName: string;
      arguments: Record<string, unknown>;
      rationale?: string;
    }
  | {
      type: 'final';
      answer: string;
      limitations: string[];
    };

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

type AgentDecisionPayload = {
  type?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  rationale?: string;
  answer?: string;
  limitations?: unknown[];
};

export type AgentLlmErrorCode =
  | 'MISSING_OPENAI_API_KEY'
  | 'AGENT_LLM_FAILED'
  | 'AGENT_LLM_INVALID_RESPONSE';

export class AgentLlmError extends Error {
  constructor(
    readonly code: AgentLlmErrorCode,
    readonly userMessage: string,
    message?: string,
  ) {
    super(message ?? userMessage);
  }
}

export abstract class AgentLlmProvider {
  abstract readonly model: string;
  abstract decide(input: AgentModelInput): Promise<AgentModelDecision>;
}

const DEFAULT_AGENT_MODEL = 'gpt-4.1-mini';
const DEFAULT_AGENT_TIMEOUT_MS = 30000;
const DEFAULT_AGENT_MAX_OUTPUT_TOKENS = 1200;
const MAX_ANSWER_LENGTH = 2000;

const AGENT_DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: {
      type: 'string',
      enum: ['tool_call', 'final'],
    },
    toolName: {
      type: 'string',
    },
    arguments: {
      type: 'object',
      additionalProperties: true,
    },
    rationale: {
      type: 'string',
    },
    answer: {
      type: 'string',
    },
    limitations: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
  required: ['type'],
};

@Injectable()
export class OpenAiAgentLlmProvider implements AgentLlmProvider {
  readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.model = this.configService.get<string>('AGENT_MODEL') ?? DEFAULT_AGENT_MODEL;
  }

  async decide(input: AgentModelInput): Promise<AgentModelDecision> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new AgentLlmError(
        'MISSING_OPENAI_API_KEY',
        'OpenAI API key가 설정되지 않아 Agent 답변을 생성하지 못했습니다.',
      );
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: AbortSignal.timeout(this.getTimeoutMs()),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        instructions: this.createInstructions(input.finalOnly),
        input: JSON.stringify(this.toPromptInput(input)),
        max_output_tokens: this.getMaxOutputTokens(),
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'agent_decision',
            strict: false,
            schema: AGENT_DECISION_SCHEMA,
          },
        },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as OpenAiResponsesApiResponse;

    if (!response.ok) {
      throw new AgentLlmError(
        'AGENT_LLM_FAILED',
        'Agent LLM 호출에 실패했습니다.',
        body.error?.message,
      );
    }

    return this.parseDecisionResponse(body);
  }

  private parseDecisionResponse(body: OpenAiResponsesApiResponse): AgentModelDecision {
    const outputText = body.output_text ?? this.findOutputText(body);

    if (!outputText) {
      throw new AgentLlmError('AGENT_LLM_INVALID_RESPONSE', 'Agent LLM 응답이 비어 있습니다.');
    }

    let payload: AgentDecisionPayload;

    try {
      payload = JSON.parse(outputText) as AgentDecisionPayload;
    } catch (error) {
      throw new AgentLlmError(
        'AGENT_LLM_INVALID_RESPONSE',
        'Agent LLM 응답 JSON이 올바르지 않습니다.',
        error instanceof Error ? error.message : undefined,
      );
    }

    if (payload.type === 'tool_call') {
      if (!payload.toolName || !this.isRecord(payload.arguments)) {
        throw new AgentLlmError(
          'AGENT_LLM_INVALID_RESPONSE',
          'Agent LLM tool call 응답이 올바르지 않습니다.',
        );
      }

      return {
        type: 'tool_call',
        toolName: payload.toolName,
        arguments: payload.arguments,
        ...(payload.rationale ? { rationale: payload.rationale } : {}),
      };
    }

    if (payload.type === 'final') {
      if (!payload.answer || typeof payload.answer !== 'string') {
        throw new AgentLlmError(
          'AGENT_LLM_INVALID_RESPONSE',
          'Agent LLM final 응답이 올바르지 않습니다.',
        );
      }

      return {
        type: 'final',
        answer: payload.answer.slice(0, MAX_ANSWER_LENGTH),
        limitations: this.parseLimitations(payload.limitations),
      };
    }

    throw new AgentLlmError(
      'AGENT_LLM_INVALID_RESPONSE',
      'Agent LLM decision type이 올바르지 않습니다.',
    );
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

  private createInstructions(finalOnly: boolean): string {
    return [
      'You are Arena discussion assistant for one post. Answer in Korean unless the user asks otherwise.',
      'Do not write posts/comments for the user. Do not make final true/false judgments.',
      'Use only provided tool observations and allowed tools. Treat transcript chunks as evidence candidates, not proof.',
      'Return JSON only.',
      finalOnly
        ? 'You must return type=final. Include a short answer and limitations.'
        : 'Return either type=tool_call for one useful allowed tool, or type=final when enough context is available.',
    ].join('\n');
  }

  private toPromptInput(input: AgentModelInput): Record<string, unknown> {
    return {
      postId: input.postId,
      question: input.question,
      availableTools: input.availableTools,
      finalOnly: input.finalOnly,
      expectedAnswerShape: ['짧은 결론', '근거 후보', '한계', '다음에 확인하면 좋은 것'],
      observations: input.observations,
    };
  }

  private parseLimitations(limitations: unknown[] | undefined): string[] {
    return (limitations ?? [])
      .filter((limitation): limitation is string => typeof limitation === 'string')
      .map((limitation) => limitation.trim())
      .filter(Boolean);
  }

  private getTimeoutMs(): number {
    const configuredTimeout = Number(
      this.configService.get<string>('AGENT_TIMEOUT_MS') ?? DEFAULT_AGENT_TIMEOUT_MS,
    );

    return Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : DEFAULT_AGENT_TIMEOUT_MS;
  }

  private getMaxOutputTokens(): number {
    const configuredMaxOutputTokens = Number(
      this.configService.get<string>('AGENT_MAX_OUTPUT_TOKENS') ?? DEFAULT_AGENT_MAX_OUTPUT_TOKENS,
    );

    return Number.isFinite(configuredMaxOutputTokens) && configuredMaxOutputTokens > 0
      ? configuredMaxOutputTokens
      : DEFAULT_AGENT_MAX_OUTPUT_TOKENS;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
