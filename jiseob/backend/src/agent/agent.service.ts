import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  AgentLlmError,
  AgentLlmProvider,
  AgentModelDecision,
  AgentToolObservation,
} from './agent-llm.provider';
import { AgentMcpCallerService, AgentToolCallOutcome } from './agent-mcp-caller.service';
import { CreateAgentRunDto } from './dto/create-agent-run.dto';
import { AgentRun } from './entities/agent-run.entity';
import { AgentStep } from './entities/agent-step.entity';
import { AgentRunStatus, AgentStepStatus, AgentStepType } from '../common/enums/agent-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { PostsService } from '../posts/posts.service';
import { User } from '../users/entities/user.entity';

export type CreateAgentRunResponse = {
  runId: string;
  postId: string;
  status: AgentRunStatus;
  question: string;
  createdAt: Date;
};

export type AgentEvidenceCandidate = {
  chunkId: string;
  startSec?: number | null;
  endSec?: number | null;
  text: string;
  similarityScore: number;
};

export type AgentRunResponse = CreateAgentRunResponse & {
  answer: string | null;
  usedTools: Array<{
    stepIndex: number;
    toolName: string;
    status: AgentStepStatus;
  }>;
  evidenceCandidates: AgentEvidenceCandidate[];
  limitations: string[];
  errorCode: string | null;
  errorMessage: string | null;
  stepCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
};

type AgentRunWithRelations = AgentRun & {
  user?: User;
  steps?: AgentStep[];
};

const ALLOWED_AGENT_TOOLS = [
  'post.getContext',
  'video.getProcessingStatus',
  'transcript.searchChunks',
  'youtube.fetchMetadata',
];
const MAX_STEPS = 4;
const DEFAULT_TRANSCRIPT_SEARCH_LIMIT = 5;
const MAX_ANSWER_LENGTH = 2000;
const DEFAULT_LIMITATION = '자막 검색 결과는 근거 후보이며 사실 여부의 최종 판정이 아닙니다.';

@Injectable()
export class AgentService {
  constructor(
    private readonly postsService: PostsService,
    private readonly mcpCaller: AgentMcpCallerService,
    private readonly llmProvider: AgentLlmProvider,
    @InjectRepository(AgentRun)
    private readonly agentRunsRepository: Repository<AgentRun>,
    @InjectRepository(AgentStep)
    private readonly agentStepsRepository: Repository<AgentStep>,
  ) {}

  async createRun(
    user: AuthenticatedUser,
    postId: string,
    dto: CreateAgentRunDto,
  ): Promise<CreateAgentRunResponse> {
    await this.postsService.getPost(postId);

    const run = await this.agentRunsRepository.save(
      this.agentRunsRepository.create({
        postId,
        userId: user.id,
        question: dto.question,
        status: AgentRunStatus.PENDING,
        evidenceCandidates: [],
        limitations: [],
        maxSteps: MAX_STEPS,
        stepCount: 0,
      }),
    );

    void this.executeRun(run.id).catch(() => undefined);

    return {
      runId: run.id,
      postId: run.postId,
      status: run.status,
      question: run.question,
      createdAt: run.createdAt,
    };
  }

  async getRun(user: AuthenticatedUser, runId: string): Promise<AgentRunResponse> {
    const run = await this.findRunWithStepsOrThrow(runId);

    if (run.userId !== user.id) {
      throw new ForbiddenException('Agent run을 조회할 권한이 없습니다.');
    }

    return this.toRunResponse(run);
  }

  async executeRun(runId: string): Promise<void> {
    const run = await this.findRunWithUserOrThrow(runId);

    if (run.status !== AgentRunStatus.PENDING) {
      return;
    }

    const startedAt = new Date();
    const seenToolCalls = new Set<string>();
    const observations: AgentToolObservation[] = [];
    const evidenceCandidates: AgentEvidenceCandidate[] = [];
    let nextStepIndex = 1;

    await this.agentRunsRepository.update(
      { id: run.id },
      {
        status: AgentRunStatus.RUNNING,
        startedAt,
        model: this.llmProvider.model,
        errorCode: null,
        errorMessage: null,
      },
    );

    try {
      const agentUser = this.toAuthenticatedUser(run);
      const listedTools = await this.mcpCaller.listTools(run.id, agentUser);
      const availableTools = ALLOWED_AGENT_TOOLS.filter(
        (toolName) => listedTools.length === 0 || listedTools.includes(toolName),
      );

      const contextOutcome = await this.callAndStoreTool({
        run,
        user: agentUser,
        stepIndex: nextStepIndex,
        toolName: 'post.getContext',
        toolArguments: { postId: run.postId },
        seenToolCalls,
      });
      nextStepIndex += 2;
      run.stepCount += 1;
      this.observeToolResult(
        observations,
        'post.getContext',
        { postId: run.postId },
        contextOutcome,
      );
      await this.agentRunsRepository.update({ id: run.id }, { stepCount: run.stepCount });

      if (!contextOutcome.ok) {
        throw new AgentExecutionError(contextOutcome.errorCode, contextOutcome.errorMessage);
      }

      while (run.stepCount < run.maxSteps) {
        const decision = await this.decideAndStoreModel({
          run,
          stepIndex: nextStepIndex,
          observations,
          availableTools,
          finalOnly: false,
        });
        nextStepIndex += 1;

        if (decision.type === 'final') {
          await this.completeRun(run, nextStepIndex, decision, evidenceCandidates);

          return;
        }

        this.assertAllowedTool(decision.toolName);

        const toolArguments = this.normalizeToolArguments(run, observations, decision);
        const outcome = await this.callAndStoreTool({
          run,
          user: agentUser,
          stepIndex: nextStepIndex,
          toolName: decision.toolName,
          toolArguments,
          seenToolCalls,
        });
        nextStepIndex += 2;
        run.stepCount += 1;
        this.observeToolResult(observations, decision.toolName, toolArguments, outcome);
        await this.agentRunsRepository.update({ id: run.id }, { stepCount: run.stepCount });

        if (outcome.ok && decision.toolName === 'transcript.searchChunks') {
          this.mergeEvidenceCandidates(evidenceCandidates, outcome.structuredContent);
        }
      }

      const finalDecision = await this.decideAndStoreModel({
        run,
        stepIndex: nextStepIndex,
        observations,
        availableTools,
        finalOnly: true,
      });
      nextStepIndex += 1;

      await this.completeRun(
        run,
        nextStepIndex,
        finalDecision.type === 'final'
          ? finalDecision
          : this.createMaxStepsFinalDecision(observations),
        evidenceCandidates,
      );
    } catch (error) {
      await this.failRun(run.id, error);
    }
  }

  private async decideAndStoreModel(input: {
    run: AgentRun;
    stepIndex: number;
    observations: AgentToolObservation[];
    availableTools: string[];
    finalOnly: boolean;
  }): Promise<AgentModelDecision> {
    const startedAt = new Date();

    try {
      const decision = await this.llmProvider.decide({
        postId: input.run.postId,
        question: input.run.question,
        observations: input.observations,
        availableTools: input.availableTools,
        finalOnly: input.finalOnly,
      });

      await this.saveStep({
        runId: input.run.id,
        stepIndex: input.stepIndex,
        type: AgentStepType.MODEL,
        status: AgentStepStatus.SUCCESS,
        modelOutput: this.sanitizeJson(decision),
        startedAt,
        completedAt: new Date(),
      });

      return decision;
    } catch (error) {
      const sanitizedError = this.toSanitizedError(error);

      await this.saveStep({
        runId: input.run.id,
        stepIndex: input.stepIndex,
        type: AgentStepType.MODEL,
        status: AgentStepStatus.FAILED,
        errorCode: sanitizedError.errorCode,
        errorMessage: sanitizedError.errorMessage,
        startedAt,
        completedAt: new Date(),
      });

      throw error;
    }
  }

  private async callAndStoreTool(input: {
    run: AgentRun;
    user: AuthenticatedUser;
    stepIndex: number;
    toolName: string;
    toolArguments: Record<string, unknown>;
    seenToolCalls: Set<string>;
  }): Promise<AgentToolCallOutcome> {
    const startedAt = new Date();

    await this.saveStep({
      runId: input.run.id,
      stepIndex: input.stepIndex,
      type: AgentStepType.TOOL_CALL,
      status: AgentStepStatus.SUCCESS,
      toolName: input.toolName,
      toolArguments: this.sanitizeJson(input.toolArguments) as Record<string, unknown>,
      startedAt,
      completedAt: new Date(),
    });

    const outcome = await this.mcpCaller.callTool(
      input.run.id,
      input.stepIndex,
      input.user,
      input.toolName,
      input.toolArguments,
      input.seenToolCalls,
    );

    await this.saveStep({
      runId: input.run.id,
      stepIndex: input.stepIndex + 1,
      type: AgentStepType.TOOL_RESULT,
      status: outcome.ok ? AgentStepStatus.SUCCESS : AgentStepStatus.FAILED,
      toolName: input.toolName,
      toolResult: this.sanitizeJson(outcome.ok ? outcome.structuredContent : outcome),
      errorCode: outcome.ok ? null : outcome.errorCode,
      errorMessage: outcome.ok ? null : outcome.errorMessage,
      startedAt,
      completedAt: new Date(),
    });

    return outcome;
  }

  private observeToolResult(
    observations: AgentToolObservation[],
    toolName: string,
    toolArguments: Record<string, unknown>,
    outcome: AgentToolCallOutcome,
  ): void {
    observations.push(
      outcome.ok
        ? {
            toolName,
            arguments: this.sanitizeJson(toolArguments) as Record<string, unknown>,
            ok: true,
            structuredContent: this.sanitizeJson(outcome.structuredContent),
            contentText: outcome.contentText,
          }
        : {
            toolName,
            arguments: this.sanitizeJson(toolArguments) as Record<string, unknown>,
            ok: false,
            errorCode: outcome.errorCode,
            errorMessage: outcome.errorMessage,
          },
    );
  }

  private async completeRun(
    run: AgentRun,
    stepIndex: number,
    decision: Extract<AgentModelDecision, { type: 'final' }>,
    evidenceCandidates: AgentEvidenceCandidate[],
  ): Promise<void> {
    const answer = decision.answer.slice(0, MAX_ANSWER_LENGTH);
    const limitations = this.normalizeLimitations(decision.limitations);

    await this.saveStep({
      runId: run.id,
      stepIndex,
      type: AgentStepType.FINAL,
      status: AgentStepStatus.SUCCESS,
      modelOutput: this.sanitizeJson({ answer, limitations }),
      startedAt: new Date(),
      completedAt: new Date(),
    });

    await this.agentRunsRepository.update(
      { id: run.id },
      {
        status: AgentRunStatus.SUCCESS,
        answer,
        evidenceCandidates,
        limitations,
        errorCode: null,
        errorMessage: null,
        stepCount: run.stepCount,
        completedAt: new Date(),
      },
    );
  }

  private async failRun(runId: string, error: unknown): Promise<void> {
    const sanitizedError = this.toSanitizedError(error);

    await this.agentRunsRepository.update(
      { id: runId },
      {
        status: AgentRunStatus.FAILED,
        errorCode: sanitizedError.errorCode,
        errorMessage: sanitizedError.errorMessage,
        completedAt: new Date(),
      },
    );
  }

  private async saveStep(input: Partial<AgentStep> & Pick<AgentStep, 'runId' | 'stepIndex'>) {
    await this.agentStepsRepository.save(this.agentStepsRepository.create(input));
  }

  private assertAllowedTool(toolName: string): void {
    if (!ALLOWED_AGENT_TOOLS.includes(toolName)) {
      throw new AgentExecutionError('TOOL_NOT_ALLOWED', '허용되지 않은 Agent tool입니다.');
    }
  }

  private normalizeToolArguments(
    run: AgentRun,
    observations: AgentToolObservation[],
    decision: Extract<AgentModelDecision, { type: 'tool_call' }>,
  ): Record<string, unknown> {
    const argumentsRecord = { ...decision.arguments };
    const postContext = this.findPostContext(observations);

    switch (decision.toolName) {
      case 'post.getContext':
        return { postId: run.postId };
      case 'transcript.searchChunks':
        return {
          ...argumentsRecord,
          postId: run.postId,
          query: typeof argumentsRecord.query === 'string' ? argumentsRecord.query : run.question,
          limit: this.normalizeLimit(argumentsRecord.limit),
        };
      case 'video.getProcessingStatus':
        return {
          ...argumentsRecord,
          videoId:
            typeof argumentsRecord.videoId === 'string'
              ? argumentsRecord.videoId
              : postContext?.videoId,
        };
      case 'youtube.fetchMetadata':
        return {
          ...argumentsRecord,
          youtubeVideoId:
            typeof argumentsRecord.youtubeVideoId === 'string'
              ? argumentsRecord.youtubeVideoId
              : postContext?.youtubeVideoId,
        };
      default:
        return argumentsRecord;
    }
  }

  private normalizeLimit(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10
      ? value
      : DEFAULT_TRANSCRIPT_SEARCH_LIMIT;
  }

  private findPostContext(
    observations: AgentToolObservation[],
  ): { videoId?: string; youtubeVideoId?: string } | null {
    const contextObservation = observations.find(
      (observation) => observation.ok && observation.toolName === 'post.getContext',
    );

    if (!contextObservation?.ok || !this.isRecord(contextObservation.structuredContent)) {
      return null;
    }

    const video = contextObservation.structuredContent.video;

    if (!this.isRecord(video)) {
      return null;
    }

    return {
      videoId: typeof video.id === 'string' ? video.id : undefined,
      youtubeVideoId: typeof video.youtubeVideoId === 'string' ? video.youtubeVideoId : undefined,
    };
  }

  private mergeEvidenceCandidates(
    evidenceCandidates: AgentEvidenceCandidate[],
    structuredContent: unknown,
  ): void {
    if (!this.isRecord(structuredContent) || !Array.isArray(structuredContent.chunks)) {
      return;
    }

    const existingChunkIds = new Set(evidenceCandidates.map((candidate) => candidate.chunkId));

    for (const chunk of structuredContent.chunks) {
      if (!this.isRecord(chunk)) {
        continue;
      }

      const chunkId = chunk.transcriptChunkId;
      const text = chunk.content;
      const similarityScore = chunk.similarityScore;

      if (
        typeof chunkId !== 'string' ||
        typeof text !== 'string' ||
        typeof similarityScore !== 'number' ||
        existingChunkIds.has(chunkId)
      ) {
        continue;
      }

      existingChunkIds.add(chunkId);
      evidenceCandidates.push({
        chunkId,
        startSec: typeof chunk.startTime === 'number' ? chunk.startTime : null,
        endSec: typeof chunk.endTime === 'number' ? chunk.endTime : null,
        text,
        similarityScore,
      });
    }
  }

  private createMaxStepsFinalDecision(
    observations: AgentToolObservation[],
  ): Extract<AgentModelDecision, { type: 'final' }> {
    const successfulTools = observations
      .filter((observation) => observation.ok)
      .map((observation) => observation.toolName);

    return {
      type: 'final',
      answer:
        successfulTools.length > 0
          ? `현재까지 확인한 도구 결과(${[...new Set(successfulTools)].join(
              ', ',
            )})를 기준으로 답변합니다. 추가 확인이 필요한 부분은 한계에 함께 남깁니다.`
          : '현재 질문에 답하기 위한 도구 결과를 확보하지 못했습니다.',
      limitations: ['Agent 최대 도구 호출 횟수에 도달해 추가 검색을 수행하지 않았습니다.'],
    };
  }

  private normalizeLimitations(limitations: string[]): string[] {
    const normalizedLimitations = limitations
      .map((limitation) => limitation.trim())
      .filter(Boolean);

    if (!normalizedLimitations.includes(DEFAULT_LIMITATION)) {
      normalizedLimitations.push(DEFAULT_LIMITATION);
    }

    return normalizedLimitations;
  }

  private async findRunWithStepsOrThrow(runId: string): Promise<AgentRunWithRelations> {
    const run = await this.agentRunsRepository
      .createQueryBuilder('run')
      .leftJoinAndSelect('run.steps', 'step', 'step.deleted_at IS NULL')
      .where('run.id = :runId', { runId })
      .andWhere('run.deleted_at IS NULL')
      .orderBy('step.stepIndex', 'ASC')
      .getOne();

    if (!run) {
      throw new NotFoundException('Agent run을 찾을 수 없습니다.');
    }

    return run as AgentRunWithRelations;
  }

  private async findRunWithUserOrThrow(runId: string): Promise<AgentRunWithRelations> {
    const run = await this.agentRunsRepository.findOne({
      where: { id: runId, deletedAt: IsNull() },
      relations: ['user'],
    });

    if (!run) {
      throw new NotFoundException('Agent run을 찾을 수 없습니다.');
    }

    return run as AgentRunWithRelations;
  }

  private toRunResponse(run: AgentRunWithRelations): AgentRunResponse {
    return {
      runId: run.id,
      postId: run.postId,
      status: run.status,
      question: run.question,
      answer: run.answer ?? null,
      usedTools: (run.steps ?? [])
        .filter((step) => step.type === AgentStepType.TOOL_CALL && step.toolName)
        .map((step) => ({
          stepIndex: step.stepIndex,
          toolName: step.toolName as string,
          status: this.findToolResultStatus(run.steps ?? [], step),
        })),
      evidenceCandidates: this.toEvidenceCandidates(run.evidenceCandidates),
      limitations: Array.isArray(run.limitations) ? run.limitations : [],
      errorCode: run.errorCode ?? null,
      errorMessage: run.errorMessage ?? null,
      stepCount: run.stepCount,
      createdAt: run.createdAt,
      startedAt: run.startedAt ?? null,
      completedAt: run.completedAt ?? null,
    };
  }

  private toEvidenceCandidates(value: unknown[]): AgentEvidenceCandidate[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is AgentEvidenceCandidate => {
      return (
        this.isRecord(item) &&
        typeof item.chunkId === 'string' &&
        typeof item.text === 'string' &&
        typeof item.similarityScore === 'number'
      );
    });
  }

  private findToolResultStatus(steps: AgentStep[], toolCallStep: AgentStep): AgentStepStatus {
    const toolResultStep = steps.find(
      (step) =>
        step.type === AgentStepType.TOOL_RESULT &&
        step.stepIndex === toolCallStep.stepIndex + 1 &&
        step.toolName === toolCallStep.toolName,
    );

    return toolResultStep?.status ?? toolCallStep.status;
  }

  private toAuthenticatedUser(run: AgentRunWithRelations): AuthenticatedUser {
    return {
      id: run.userId,
      email: run.user?.email ?? '',
      role: run.user?.role ?? UserRole.USER,
      sessionId: '',
    };
  }

  private toSanitizedError(error: unknown): { errorCode: string; errorMessage: string } {
    if (error instanceof AgentExecutionError) {
      return {
        errorCode: error.code,
        errorMessage: error.userMessage,
      };
    }

    if (error instanceof AgentLlmError) {
      return {
        errorCode: error.code,
        errorMessage: error.userMessage,
      };
    }

    return {
      errorCode: 'AGENT_EXECUTION_FAILED',
      errorMessage: 'Agent 실행 중 오류가 발생했습니다.',
    };
  }

  private sanitizeJson(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeJson(item));
    }

    if (!this.isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !this.isSensitiveKey(key))
        .map(([key, item]) => [key, this.sanitizeJson(item)]),
    );
  }

  private isSensitiveKey(key: string): boolean {
    const normalizedKey = key.toLowerCase();

    return (
      normalizedKey.includes('apikey') ||
      normalizedKey.includes('api_key') ||
      normalizedKey.includes('token') ||
      normalizedKey.includes('cookie') ||
      normalizedKey.includes('authorization') ||
      normalizedKey.includes('password') ||
      normalizedKey.includes('secret') ||
      normalizedKey === 'stack'
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}

class AgentExecutionError extends Error {
  constructor(
    readonly code: string,
    readonly userMessage: string,
  ) {
    super(userMessage);
  }
}
