import { ForbiddenException } from '@nestjs/common';
import { AgentStepStatus, AgentStepType } from '../common/enums/agent-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AgentLlmProvider } from './agent-llm.provider';
import { AgentMcpCallerService } from './agent-mcp-caller.service';
import { AgentService } from './agent.service';
import { AgentRun } from './entities/agent-run.entity';
import { AgentStep } from './entities/agent-step.entity';

describe('AgentService', () => {
  const user = {
    id: '01J00000000000000000000000',
    email: 'user@example.com',
    role: UserRole.USER,
    sessionId: '01J00000000000000000000001',
  };
  const runId = '01J00000000000000000000002';
  const postId = '01J00000000000000000000003';
  const videoId = '01J00000000000000000000004';
  const chunkId = '01J00000000000000000000005';
  const now = new Date('2026-06-15T00:00:00.000Z');

  const createRun = (overrides: Partial<AgentRun> = {}) =>
    ({
      id: runId,
      postId,
      userId: user.id,
      question: '이 주장이 영상에 나오나요?',
      status: 'PENDING',
      answer: null,
      evidenceCandidates: [],
      limitations: [],
      maxSteps: 4,
      stepCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      ...overrides,
    }) as AgentRun;

  const createService = (overrides: {
    postsService?: unknown;
    mcpCaller?: Partial<AgentMcpCallerService>;
    llmProvider?: Partial<AgentLlmProvider>;
    runsRepository?: Record<string, jest.Mock>;
    stepsRepository?: Record<string, jest.Mock>;
  }) =>
    new AgentService(
      (overrides.postsService ?? { getPost: jest.fn() }) as never,
      (overrides.mcpCaller ?? {}) as AgentMcpCallerService,
      (overrides.llmProvider ?? { model: 'test-model' }) as AgentLlmProvider,
      (overrides.runsRepository ?? {}) as never,
      (overrides.stepsRepository ?? {}) as never,
    );

  it('creates a pending run and schedules async execution', async () => {
    const savedRun = createRun();
    const runsRepository = {
      create: jest.fn((input: Partial<AgentRun>) => ({ ...savedRun, ...input })),
      save: jest.fn(async (run: AgentRun) => run),
    };
    const service = createService({
      postsService: {
        getPost: jest.fn().mockResolvedValue({ id: postId }),
      },
      runsRepository,
    });
    const executeSpy = jest.spyOn(service, 'executeRun').mockResolvedValue(undefined);

    await expect(
      service.createRun(user, postId, { question: '이 주장이 영상에 나오나요?' }),
    ).resolves.toMatchObject({
      runId,
      postId,
      status: 'PENDING',
    });
    expect(runsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        postId,
        userId: user.id,
        status: 'PENDING',
      }),
    );
    expect(executeSpy).toHaveBeenCalledWith(runId);
  });

  it('runs MCP-first loop and stores normalized transcript evidence', async () => {
    const run = createRun();
    const update = jest.fn();
    const runsRepository = {
      update,
      findOne: jest.fn().mockResolvedValue(run),
      createQueryBuilder: jest.fn(),
    };
    const savedSteps: Partial<AgentStep>[] = [];
    const stepsRepository = {
      create: jest.fn((input: Partial<AgentStep>) => input),
      save: jest.fn(async (step: Partial<AgentStep>) => {
        savedSteps.push(step);
        return step;
      }),
    };
    const mcpCaller = {
      listTools: jest
        .fn()
        .mockResolvedValue([
          'post.getContext',
          'video.getProcessingStatus',
          'transcript.searchChunks',
          'youtube.fetchMetadata',
          'video.retryProcessing',
        ]),
      callTool: jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          structuredContent: {
            id: postId,
            title: '게시글',
            video: {
              id: videoId,
              youtubeVideoId: 'dQw4w9WgXcQ',
            },
          },
          contentText: '{}',
        })
        .mockResolvedValueOnce({
          ok: true,
          structuredContent: {
            chunks: [
              {
                transcriptChunkId: chunkId,
                content: '관련 자막입니다.',
                startTime: 31.2,
                endTime: 43.9,
                similarityScore: 0.82,
              },
            ],
          },
          contentText: '{}',
        }),
    };
    const llmProvider = {
      model: 'test-model',
      decide: jest
        .fn()
        .mockResolvedValueOnce({
          type: 'tool_call',
          toolName: 'transcript.searchChunks',
          arguments: {
            query: '이 주장이 영상에 나오나요?',
            limit: 5,
          },
        })
        .mockResolvedValueOnce({
          type: 'final',
          answer: '관련 자막 후보가 있습니다.',
          limitations: ['최종 사실 판정은 아닙니다.'],
        }),
    };
    const service = createService({
      runsRepository,
      stepsRepository,
      mcpCaller,
      llmProvider,
    });

    await service.executeRun(runId);

    expect(mcpCaller.callTool).toHaveBeenNthCalledWith(
      1,
      runId,
      1,
      expect.objectContaining({ id: user.id }),
      'post.getContext',
      { postId },
      expect.any(Set),
    );
    expect(mcpCaller.callTool).toHaveBeenNthCalledWith(
      2,
      runId,
      4,
      expect.objectContaining({ id: user.id }),
      'transcript.searchChunks',
      {
        postId,
        query: '이 주장이 영상에 나오나요?',
        limit: 5,
      },
      expect.any(Set),
    );
    expect(mcpCaller.callTool).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'video.retryProcessing',
      expect.anything(),
      expect.anything(),
    );
    expect(update).toHaveBeenLastCalledWith(
      { id: runId },
      expect.objectContaining({
        status: 'SUCCESS',
        stepCount: 2,
        evidenceCandidates: [
          {
            chunkId,
            startSec: 31.2,
            endSec: 43.9,
            text: '관련 자막입니다.',
            similarityScore: 0.82,
          },
        ],
      }),
    );
    expect(savedSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolName: 'post.getContext',
          status: AgentStepStatus.SUCCESS,
        }),
        expect.objectContaining({
          toolName: 'transcript.searchChunks',
          status: AgentStepStatus.SUCCESS,
        }),
      ]),
    );
  });

  it('allows only the run creator to read a run', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(createRun()),
    };
    const service = createService({
      runsRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      },
    });

    await expect(
      service.getRun({ ...user, id: '01J00000000000000000000099' }, runId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('reports used tool status from the matching tool result step', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        ...createRun({ status: 'FAILED' as never }),
        steps: [
          {
            stepIndex: 1,
            type: AgentStepType.TOOL_CALL,
            status: AgentStepStatus.SUCCESS,
            toolName: 'post.getContext',
          },
          {
            stepIndex: 2,
            type: AgentStepType.TOOL_RESULT,
            status: AgentStepStatus.FAILED,
            toolName: 'post.getContext',
          },
        ],
      }),
    };
    const service = createService({
      runsRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      },
    });

    await expect(service.getRun(user, runId)).resolves.toMatchObject({
      usedTools: [
        {
          stepIndex: 1,
          toolName: 'post.getContext',
          status: AgentStepStatus.FAILED,
        },
      ],
    });
  });
});
