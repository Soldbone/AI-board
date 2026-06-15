import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { z, ZodError } from 'zod';

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

const agentDecisionSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('tool_call'),
      toolName: z.string(),
      arguments: z.record(z.string(), z.unknown()),
      rationale: z.string().optional(),
    }),
    z.object({
      type: z.literal('final'),
      answer: z.string(),
      limitations: z.array(z.string()),
    }),
  ])
  .describe('Arena agent decision');

type AgentDecisionSchemaOutput = z.infer<typeof agentDecisionSchema>;

@Injectable()
export class OpenAiAgentLlmProvider implements AgentLlmProvider {
  readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.model = this.configService.get<string>('AGENT_MODEL') ?? DEFAULT_AGENT_MODEL;
  }

  async decide(input: AgentModelInput): Promise<AgentModelDecision> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();

    if (!apiKey) {
      throw new AgentLlmError(
        'MISSING_OPENAI_API_KEY',
        'OpenAI API key가 설정되지 않아 Agent 답변을 생성하지 못했습니다.',
      );
    }

    try {
      const model = new ChatOpenAI({
        apiKey,
        model: this.model,
        timeout: this.getTimeoutMs(),
        maxTokens: this.getMaxOutputTokens(),
        maxRetries: 0,
        temperature: 0,
        modelKwargs: {
          store: false,
        },
        zdrEnabled: true,
      });
      const structuredModel = model.withStructuredOutput<AgentDecisionSchemaOutput>(
        agentDecisionSchema,
        {
          name: 'agent_decision',
          strict: true,
        },
      );
      const decision = await structuredModel.invoke([
        new SystemMessage(this.createInstructions(input.finalOnly)),
        new HumanMessage(JSON.stringify(this.toPromptInput(input))),
      ]);

      return this.normalizeDecision(decision);
    } catch (error) {
      if (error instanceof AgentLlmError) {
        throw error;
      }

      if (this.isStructuredOutputError(error)) {
        throw new AgentLlmError(
          'AGENT_LLM_INVALID_RESPONSE',
          'Agent LLM structured output이 올바르지 않습니다.',
          this.getErrorMessage(error),
        );
      }

      throw new AgentLlmError(
        'AGENT_LLM_FAILED',
        'Agent LLM 호출에 실패했습니다.',
        this.getErrorMessage(error),
      );
    }
  }

  private normalizeDecision(decision: unknown): AgentModelDecision {
    const parsedDecision = agentDecisionSchema.safeParse(decision);

    if (!parsedDecision.success) {
      throw new AgentLlmError(
        'AGENT_LLM_INVALID_RESPONSE',
        'Agent LLM decision 응답이 올바르지 않습니다.',
        parsedDecision.error.message,
      );
    }

    const data = parsedDecision.data;

    if (data.type === 'final') {
      return {
        type: 'final',
        answer: data.answer.slice(0, MAX_ANSWER_LENGTH),
        limitations: this.normalizeLimitations(data.limitations),
      };
    }

    return {
      type: 'tool_call',
      toolName: data.toolName,
      arguments: data.arguments,
      ...(data.rationale ? { rationale: data.rationale } : {}),
    };
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

  private normalizeLimitations(limitations: string[]): string[] {
    return limitations.map((limitation) => limitation.trim()).filter(Boolean);
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

  private isStructuredOutputError(error: unknown): boolean {
    if (error instanceof ZodError) {
      return true;
    }

    if (!(error instanceof Error)) {
      return false;
    }

    return (
      error.name.includes('Zod') ||
      error.message.includes('Failed to parse structured output') ||
      error.message.includes('structured output')
    );
  }

  private getErrorMessage(error: unknown): string | undefined {
    return error instanceof Error ? error.message : undefined;
  }
}
