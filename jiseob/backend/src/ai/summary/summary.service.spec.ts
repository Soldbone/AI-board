import { BadRequestException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Comment } from '../../comments/entities/comment.entity';
import { SummaryStatus, SummaryTargetType } from '../../common/enums/ai-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { User } from '../../users/entities/user.entity';
import { AiSummary } from './entities/ai-summary.entity';
import { SummaryProviderError } from './summary.provider';
import { SummaryService } from './summary.service';

describe('SummaryService', () => {
  const user = {
    id: '01J00000000000000000000000',
    email: 'user@example.com',
    role: UserRole.USER,
    sessionId: '01J00000000000000000000001',
  };
  const rootCommentId = '01J00000000000000000000002';
  const postId = '01J00000000000000000000003';
  const summaryId = '01J00000000000000000000004';
  const baseTime = new Date('2026-06-15T00:00:00.000Z');

  const createComment = (index: number, overrides: Partial<Comment> = {}) =>
    ({
      id:
        index === 0
          ? rootCommentId
          : `01J000000000000000000000${String(index + 10).padStart(2, '0')}`,
      postId,
      authorId: user.id,
      parentCommentId: index === 0 ? null : rootCommentId,
      content: index === 0 ? '루트 댓글' : `대댓글 ${index}`,
      createdAt: new Date(baseTime.getTime() + index * 1000),
      updatedAt: new Date(baseTime.getTime() + index * 1000),
      deletedAt: null,
      author: {
        id: user.id,
        nickname: '작성자',
        deletedAt: null,
      } as User,
      ...overrides,
    }) as Comment & { author: User };

  const createThread = (count = 10) =>
    Array.from({ length: count }, (_, index) => createComment(index));

  const createSummary = (overrides: Partial<AiSummary> = {}) =>
    ({
      id: summaryId,
      targetType: SummaryTargetType.COMMENT_THREAD,
      postId,
      rootCommentId,
      createdById: user.id,
      summaryText: null,
      summaryStatus: SummaryStatus.PENDING,
      summarizedCommentCount: 10,
      lastCommentId: '01J00000000000000000000019',
      lastCommentUpdatedAt: new Date(baseTime.getTime() + 9000),
      errorCode: null,
      errorMessage: null,
      createdAt: baseTime,
      updatedAt: baseTime,
      generatedAt: null,
      deletedAt: null,
      ...overrides,
    }) as AiSummary;

  const createQueryBuilder = (result: unknown, many = false) => ({
    innerJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(many ? null : result),
    getMany: jest.fn().mockResolvedValue(many ? result : []),
  });

  const createService = (
    input: {
      thread?: Comment[];
      root?: Comment | null;
      existingSummary?: AiSummary | null;
      provider?: Record<string, jest.Mock>;
      summariesRepository?: Record<string, jest.Mock>;
      config?: Record<string, string | undefined>;
    } = {},
  ) => {
    const thread = input.thread ?? createThread();
    const root = input.root === undefined ? thread[0] : input.root;
    const commentsRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(createQueryBuilder(root))
        .mockReturnValueOnce(createQueryBuilder(thread, true)),
    };
    const summariesRepository = {
      findOne: jest.fn().mockResolvedValue(input.existingSummary ?? null),
      create: jest.fn((values: Partial<AiSummary>) =>
        createSummary({
          ...values,
          id: summaryId,
          createdAt: baseTime,
          updatedAt: baseTime,
        }),
      ),
      save: jest.fn(async (summary: AiSummary) => summary),
      update: jest.fn(),
      ...input.summariesRepository,
    };
    const provider = input.provider ?? {
      summarize: jest.fn().mockResolvedValue({ summaryText: '요약 결과' }),
    };
    const configService = {
      get: jest.fn((key: string) => input.config?.[key]),
    } as unknown as ConfigService;
    const service = new SummaryService(
      configService,
      provider as never,
      summariesRepository as never,
      commentsRepository as never,
    );

    return {
      service,
      provider,
      summariesRepository,
      commentsRepository,
    };
  };

  it('rejects summary creation when active comments are fewer than 10', async () => {
    const { service, summariesRepository } = createService({
      thread: createThread(9),
    });

    await expect(service.createSummary(user, rootCommentId)).rejects.toThrow(BadRequestException);
    expect(summariesRepository.save).not.toHaveBeenCalled();
  });

  it('creates a pending summary and queues async generation for enough active comments', async () => {
    const { service, summariesRepository } = createService();
    const generateSpy = jest.spyOn(service, 'generateSummary').mockResolvedValue(undefined);

    await expect(service.createSummary(user, rootCommentId)).resolves.toMatchObject({
      httpStatus: HttpStatus.ACCEPTED,
      summary: {
        summaryId,
        status: SummaryStatus.PENDING,
        summarizedCommentCount: 10,
        currentCommentCount: 10,
        isStale: false,
      },
    });
    expect(summariesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        rootCommentId,
        postId,
        createdById: user.id,
        summaryStatus: SummaryStatus.PENDING,
        summarizedCommentCount: 10,
      }),
    );
    expect(generateSpy).toHaveBeenCalledWith(summaryId);
  });

  it('returns a fresh successful summary without queuing a provider call', async () => {
    const existingSummary = createSummary({
      summaryText: '기존 요약',
      summaryStatus: SummaryStatus.SUCCESS,
      generatedAt: baseTime,
    });
    const { service, summariesRepository } = createService({ existingSummary });
    const generateSpy = jest.spyOn(service, 'generateSummary').mockResolvedValue(undefined);

    await expect(service.createSummary(user, rootCommentId)).resolves.toMatchObject({
      httpStatus: HttpStatus.OK,
      summary: {
        summaryText: '기존 요약',
        isStale: false,
      },
    });
    expect(generateSpy).not.toHaveBeenCalled();
    expect(summariesRepository.save).not.toHaveBeenCalled();
  });

  it('returns an existing pending summary without duplicate queueing', async () => {
    const existingSummary = createSummary();
    const { service } = createService({ existingSummary });
    const generateSpy = jest.spyOn(service, 'generateSummary').mockResolvedValue(undefined);

    await expect(service.createSummary(user, rootCommentId)).resolves.toMatchObject({
      httpStatus: HttpStatus.ACCEPTED,
      summary: {
        status: SummaryStatus.PENDING,
      },
    });
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('reuses the same row for stale successful summaries', async () => {
    const thread = [...createThread(), createComment(10)];
    const existingSummary = createSummary({
      summaryText: '기존 요약',
      summaryStatus: SummaryStatus.SUCCESS,
      generatedAt: baseTime,
    });
    const { service, summariesRepository } = createService({ thread, existingSummary });
    const generateSpy = jest.spyOn(service, 'generateSummary').mockResolvedValue(undefined);

    await expect(service.createSummary(user, rootCommentId)).resolves.toMatchObject({
      httpStatus: HttpStatus.ACCEPTED,
      summary: {
        summaryId,
        status: SummaryStatus.PENDING,
        isStale: true,
      },
    });
    expect(existingSummary.summaryStatus).toBe(SummaryStatus.PENDING);
    expect(summariesRepository.save).toHaveBeenCalledWith(existingSummary);
    expect(generateSpy).toHaveBeenCalledWith(summaryId);
  });

  it('rejects overlong provider input before saving or queueing', async () => {
    const longThread = createThread().map((comment) => ({
      ...comment,
      content: '가'.repeat(71),
    })) as Comment[];
    const { service, summariesRepository } = createService({ thread: longThread });
    const generateSpy = jest.spyOn(service, 'generateSummary').mockResolvedValue(undefined);

    await expect(service.createSummary(user, rootCommentId)).rejects.toThrow(BadRequestException);
    expect(summariesRepository.save).not.toHaveBeenCalled();
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('sends only changed comments for stale incremental generation', async () => {
    const modifiedComment = createComment(2, {
      content: '수정된 대댓글',
      updatedAt: new Date(baseTime.getTime() + 12000),
    });
    const newComment = createComment(10, {
      content: '새 대댓글',
      createdAt: new Date(baseTime.getTime() + 13000),
      updatedAt: new Date(baseTime.getTime() + 13000),
    });
    const thread = createThread();
    thread[2] = modifiedComment;
    thread.push(newComment);
    const pendingSummary = createSummary({
      summaryText: '기존 요약',
      summaryStatus: SummaryStatus.PENDING,
    });
    const provider = {
      summarize: jest.fn().mockResolvedValue({ summaryText: '갱신 요약' }),
    };
    const { service, summariesRepository } = createService({
      thread,
      provider,
      summariesRepository: {
        findOne: jest.fn().mockResolvedValue(pendingSummary),
        update: jest.fn(),
      },
    });

    await service.generateSummary(summaryId);

    expect(provider.summarize).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'incremental',
        previousSummaryText: '기존 요약',
        comments: [
          expect.objectContaining({ id: modifiedComment.id }),
          expect.objectContaining({ id: newComment.id }),
        ],
      }),
    );
    expect(summariesRepository.update).toHaveBeenCalledWith(
      summaryId,
      expect.objectContaining({
        summaryStatus: SummaryStatus.SUCCESS,
        summaryText: '갱신 요약',
        summarizedCommentCount: 11,
        lastCommentId: newComment.id,
      }),
    );
  });

  it('marks provider failures as sanitized FAILED status while preserving old summary text', async () => {
    const pendingSummary = createSummary({
      summaryText: '기존 요약',
      summaryStatus: SummaryStatus.PENDING,
    });
    const provider = {
      summarize: jest
        .fn()
        .mockRejectedValue(
          new SummaryProviderError(
            'SUMMARY_PROVIDER_FAILED',
            '댓글 요약 API 호출에 실패했습니다. 잠시 후 다시 시도해주세요.',
            'raw provider stack with sk-test-token',
          ),
        ),
    };
    const { service, summariesRepository } = createService({
      provider,
      summariesRepository: {
        findOne: jest.fn().mockResolvedValue(pendingSummary),
        update: jest.fn(),
      },
    });

    await service.generateSummary(summaryId);

    expect(summariesRepository.update).toHaveBeenCalledWith(
      summaryId,
      expect.objectContaining({
        summaryStatus: SummaryStatus.FAILED,
        errorCode: 'SUMMARY_PROVIDER_FAILED',
        errorMessage: '댓글 요약 API 호출에 실패했습니다. 잠시 후 다시 시도해주세요.',
      }),
    );
    expect(summariesRepository.update).not.toHaveBeenCalledWith(
      summaryId,
      expect.objectContaining({
        errorMessage: expect.stringContaining('sk-test-token'),
      }),
    );
  });

  it('reports stale summaries when an active comment was modified', async () => {
    const modifiedThread = createThread();
    modifiedThread[1] = createComment(1, {
      updatedAt: new Date(baseTime.getTime() + 20000),
    });
    const existingSummary = createSummary({
      summaryText: '기존 요약',
      summaryStatus: SummaryStatus.SUCCESS,
      generatedAt: baseTime,
    });
    const { service } = createService({
      thread: modifiedThread,
      existingSummary,
    });

    await expect(service.getSummary(rootCommentId)).resolves.toMatchObject({
      isStale: true,
      currentCommentCount: 10,
      summarizedCommentCount: 10,
    });
  });
});
