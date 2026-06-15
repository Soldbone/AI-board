import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Comment } from '../../comments/entities/comment.entity';
import { SummaryStatus, SummaryTargetType } from '../../common/enums/ai-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { User } from '../../users/entities/user.entity';
import { AiSummary } from './entities/ai-summary.entity';
import {
  SummaryProvider,
  SummaryProviderError,
  SummaryProviderInput,
  SummaryThreadComment,
} from './summary.provider';

const MIN_SUMMARY_COMMENT_COUNT = 10;
const DEFAULT_SUMMARY_MAX_INPUT_CHARS = 700;
const SUMMARY_INPUT_TOO_LONG_MESSAGE = '요약 가능한 댓글 길이를 초과했습니다.';

type SummaryThreadCommentWithState = SummaryThreadComment & {
  updatedAt: Date;
};

type CommentWithAuthor = Comment & {
  author?: User | null;
};

type ThreadSnapshot = {
  rootCommentId: string;
  postId: string;
  comments: SummaryThreadCommentWithState[];
  currentCommentCount: number;
  lastCommentId: string | null;
  lastCommentUpdatedAt: Date | null;
};

export type SummaryResponse = {
  summaryId: string;
  rootCommentId: string;
  postId: string;
  status: SummaryStatus;
  summaryText: string | null;
  summarizedCommentCount: number;
  currentCommentCount: number;
  isStale: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  generatedAt: Date | null;
};

export type CreateSummaryResult = {
  httpStatus: HttpStatus;
  summary: SummaryResponse;
};

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly summaryProvider: SummaryProvider,
    @InjectRepository(AiSummary)
    private readonly summariesRepository: Repository<AiSummary>,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
  ) {}

  async createSummary(
    user: AuthenticatedUser,
    rootCommentId: string,
  ): Promise<CreateSummaryResult> {
    const snapshot = await this.loadActiveThreadOrThrow(rootCommentId);

    this.assertEnoughComments(snapshot);

    const existingSummary = await this.findActiveSummary(rootCommentId);

    if (existingSummary?.summaryStatus === SummaryStatus.PENDING) {
      return {
        httpStatus: HttpStatus.ACCEPTED,
        summary: this.toResponse(existingSummary, snapshot),
      };
    }

    if (
      existingSummary?.summaryStatus === SummaryStatus.SUCCESS &&
      !this.isStale(existingSummary, snapshot)
    ) {
      return {
        httpStatus: HttpStatus.OK,
        summary: this.toResponse(existingSummary, snapshot),
      };
    }

    const providerInput = this.buildProviderInput(existingSummary, snapshot);
    this.assertInputWithinLimit(providerInput);

    const summary = existingSummary
      ? await this.prepareExistingSummary(existingSummary, snapshot)
      : await this.createPendingSummary(user, snapshot);

    this.enqueueSummaryGeneration(summary.id);

    return {
      httpStatus: HttpStatus.ACCEPTED,
      summary: this.toResponse(summary, snapshot),
    };
  }

  async getSummary(rootCommentId: string): Promise<SummaryResponse> {
    const snapshot = await this.loadActiveThreadOrThrow(rootCommentId);
    const summary = await this.findActiveSummary(rootCommentId);

    if (!summary) {
      throw new NotFoundException('댓글 요약을 찾을 수 없습니다.');
    }

    return this.toResponse(summary, snapshot);
  }

  async generateSummary(summaryId: string): Promise<void> {
    const summary = await this.summariesRepository.findOne({
      where: { id: summaryId, deletedAt: IsNull() },
    });

    if (!summary || summary.summaryStatus !== SummaryStatus.PENDING) {
      return;
    }

    try {
      const snapshot = await this.loadActiveThreadOrThrow(summary.rootCommentId);
      const providerInput = this.buildProviderInput(summary, snapshot);

      this.assertInputWithinLimit(providerInput);

      const result = await this.summaryProvider.summarize(providerInput);

      await this.summariesRepository.update(summary.id, {
        summaryText: result.summaryText,
        summaryStatus: SummaryStatus.SUCCESS,
        summarizedCommentCount: snapshot.currentCommentCount,
        lastCommentId: snapshot.lastCommentId,
        lastCommentUpdatedAt: snapshot.lastCommentUpdatedAt,
        errorCode: null,
        errorMessage: null,
        generatedAt: new Date(),
      });
    } catch (error) {
      const failure = this.toFailure(error);

      this.logger.warn(`Comment summary generation failed for ${summaryId}: ${failure.code}`);
      await this.summariesRepository.update(summary.id, {
        summaryStatus: SummaryStatus.FAILED,
        errorCode: failure.code,
        errorMessage: failure.message,
      });
    }
  }

  private enqueueSummaryGeneration(summaryId: string): void {
    void this.generateSummary(summaryId).catch((error: unknown) => {
      this.logger.warn(
        `Summary generation failed after enqueue: ${summaryId}`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  private async loadActiveThreadOrThrow(rootCommentId: string): Promise<ThreadSnapshot> {
    const rootComment = await this.commentsRepository
      .createQueryBuilder('root')
      .innerJoin('root.post', 'post', 'post.deleted_at IS NULL')
      .where('root.id = :rootCommentId', { rootCommentId })
      .andWhere('root.parent_comment_id IS NULL')
      .andWhere('root.deleted_at IS NULL')
      .getOne();

    if (!rootComment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    const comments = (await this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.author', 'author')
      .where('comment.post_id = :postId', { postId: rootComment.postId })
      .andWhere('comment.deleted_at IS NULL')
      .andWhere('(comment.id = :rootCommentId OR comment.parent_comment_id = :rootCommentId)', {
        rootCommentId,
      })
      .orderBy('comment.createdAt', 'ASC')
      .addOrderBy('comment.id', 'ASC')
      .getMany()) as CommentWithAuthor[];

    const activeComments = comments.map((comment) => this.toThreadComment(comment, rootCommentId));
    const lastComment = activeComments.at(-1) ?? null;

    return {
      rootCommentId,
      postId: rootComment.postId,
      comments: activeComments,
      currentCommentCount: activeComments.length,
      lastCommentId: lastComment?.id ?? null,
      lastCommentUpdatedAt: this.getLastCommentUpdatedAt(activeComments),
    };
  }

  private async findActiveSummary(rootCommentId: string): Promise<AiSummary | null> {
    return this.summariesRepository.findOne({
      where: {
        rootCommentId,
        deletedAt: IsNull(),
      },
    });
  }

  private async createPendingSummary(
    user: AuthenticatedUser,
    snapshot: ThreadSnapshot,
  ): Promise<AiSummary> {
    return this.summariesRepository.save(
      this.summariesRepository.create({
        targetType: SummaryTargetType.COMMENT_THREAD,
        postId: snapshot.postId,
        rootCommentId: snapshot.rootCommentId,
        createdById: user.id,
        summaryStatus: SummaryStatus.PENDING,
        summarizedCommentCount: snapshot.currentCommentCount,
        lastCommentId: snapshot.lastCommentId,
        lastCommentUpdatedAt: snapshot.lastCommentUpdatedAt,
        errorCode: null,
        errorMessage: null,
      }),
    );
  }

  private async prepareExistingSummary(
    summary: AiSummary,
    snapshot: ThreadSnapshot,
  ): Promise<AiSummary> {
    summary.summaryStatus = SummaryStatus.PENDING;
    summary.errorCode = null;
    summary.errorMessage = null;

    if (!summary.summaryText) {
      summary.summarizedCommentCount = snapshot.currentCommentCount;
      summary.lastCommentId = snapshot.lastCommentId;
      summary.lastCommentUpdatedAt = snapshot.lastCommentUpdatedAt;
    }

    return this.summariesRepository.save(summary);
  }

  private buildProviderInput(
    summary: AiSummary | null,
    snapshot: ThreadSnapshot,
  ): SummaryProviderInput {
    if (!summary?.summaryText) {
      return {
        rootCommentId: snapshot.rootCommentId,
        postId: snapshot.postId,
        mode: 'full',
        comments: snapshot.comments.map((comment) => this.toProviderComment(comment)),
      };
    }

    const changedComments = this.getChangedComments(summary, snapshot);
    const changeNote = this.createChangeNote(summary, snapshot, changedComments.length);

    return {
      rootCommentId: snapshot.rootCommentId,
      postId: snapshot.postId,
      mode: 'incremental',
      previousSummaryText: summary.summaryText,
      comments: changedComments.map((comment) => this.toProviderComment(comment)),
      ...(changeNote ? { changeNote } : {}),
    };
  }

  private getChangedComments(
    summary: AiSummary,
    snapshot: ThreadSnapshot,
  ): SummaryThreadCommentWithState[] {
    const lastKnownIndex = summary.lastCommentId
      ? snapshot.comments.findIndex((comment) => comment.id === summary.lastCommentId)
      : -1;
    const lastCommentUpdatedAt = summary.lastCommentUpdatedAt?.getTime() ?? 0;

    return snapshot.comments.filter((comment, index) => {
      const isNewComment = lastKnownIndex >= 0 && index > lastKnownIndex;
      const isModifiedComment =
        lastCommentUpdatedAt > 0 && comment.updatedAt.getTime() > lastCommentUpdatedAt;

      return isNewComment || isModifiedComment;
    });
  }

  private createChangeNote(
    summary: AiSummary,
    snapshot: ThreadSnapshot,
    changedCommentCount: number,
  ): string | null {
    const notes: string[] = [];

    if (snapshot.currentCommentCount < summary.summarizedCommentCount) {
      notes.push('이전 요약 이후 삭제된 댓글이 있어 현재 active 댓글 수가 줄었습니다.');
    }

    if (
      summary.lastCommentId &&
      snapshot.comments.length > 0 &&
      !snapshot.comments.some((comment) => comment.id === summary.lastCommentId)
    ) {
      notes.push('이전 요약의 마지막 댓글은 현재 active 댓글에 포함되지 않습니다.');
    }

    if (this.isStale(summary, snapshot) && changedCommentCount === 0 && notes.length === 0) {
      notes.push('이전 요약 이후 댓글 스레드 구성이 변경되었습니다.');
    }

    return notes.length > 0 ? notes.join(' ') : null;
  }

  private assertEnoughComments(snapshot: ThreadSnapshot): void {
    if (snapshot.currentCommentCount < MIN_SUMMARY_COMMENT_COUNT) {
      throw new BadRequestException('요약할 댓글이 충분하지 않습니다.');
    }
  }

  private assertInputWithinLimit(input: SummaryProviderInput): void {
    if (this.getInputLength(input) > this.getMaxInputChars()) {
      throw new BadRequestException(SUMMARY_INPUT_TOO_LONG_MESSAGE);
    }
  }

  private getInputLength(input: SummaryProviderInput): number {
    const previousSummaryLength = input.previousSummaryText?.length ?? 0;
    const commentsLength = input.comments.reduce((sum, comment) => sum + comment.content.length, 0);

    return previousSummaryLength + commentsLength;
  }

  private getMaxInputChars(): number {
    const configuredMaxInputChars = Number(
      this.configService.get<string>('SUMMARY_MAX_INPUT_CHARS') ?? DEFAULT_SUMMARY_MAX_INPUT_CHARS,
    );

    return Number.isFinite(configuredMaxInputChars) && configuredMaxInputChars > 0
      ? configuredMaxInputChars
      : DEFAULT_SUMMARY_MAX_INPUT_CHARS;
  }

  private isStale(summary: AiSummary, snapshot: ThreadSnapshot): boolean {
    return (
      summary.summarizedCommentCount !== snapshot.currentCommentCount ||
      (summary.lastCommentId ?? null) !== snapshot.lastCommentId ||
      this.toTime(summary.lastCommentUpdatedAt ?? null) !==
        this.toTime(snapshot.lastCommentUpdatedAt)
    );
  }

  private toResponse(summary: AiSummary, snapshot: ThreadSnapshot): SummaryResponse {
    return {
      summaryId: summary.id,
      rootCommentId: summary.rootCommentId,
      postId: summary.postId,
      status: summary.summaryStatus,
      summaryText: summary.summaryText ?? null,
      summarizedCommentCount: summary.summarizedCommentCount,
      currentCommentCount: snapshot.currentCommentCount,
      isStale: this.isStale(summary, snapshot),
      errorCode: summary.errorCode ?? null,
      errorMessage: summary.errorMessage ?? null,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      generatedAt: summary.generatedAt ?? null,
    };
  }

  private toThreadComment(
    comment: CommentWithAuthor,
    rootCommentId: string,
  ): SummaryThreadCommentWithState {
    return {
      id: comment.id,
      authorNickname: this.getAuthorNickname(comment),
      content: comment.content,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      isRoot: comment.id === rootCommentId,
    };
  }

  private toProviderComment(comment: SummaryThreadCommentWithState): SummaryThreadComment {
    return {
      id: comment.id,
      authorNickname: comment.authorNickname,
      content: comment.content,
      createdAt: comment.createdAt,
      isRoot: comment.isRoot,
    };
  }

  private getLastCommentUpdatedAt(comments: SummaryThreadCommentWithState[]): Date | null {
    const lastUpdatedAt = comments.reduce<Date | null>((latest, comment) => {
      if (!latest || comment.updatedAt.getTime() > latest.getTime()) {
        return comment.updatedAt;
      }

      return latest;
    }, null);

    return lastUpdatedAt;
  }

  private getAuthorNickname(comment: CommentWithAuthor): string {
    if (!comment.author || comment.author.deletedAt) {
      return '탈퇴한 회원';
    }

    return comment.author.nickname;
  }

  private toTime(date: Date | null): number | null {
    return date ? date.getTime() : null;
  }

  private toFailure(error: unknown): { code: string; message: string } {
    if (error instanceof SummaryProviderError) {
      return {
        code: error.code,
        message: error.userMessage,
      };
    }

    if (error instanceof BadRequestException) {
      return {
        code: 'SUMMARY_INPUT_TOO_LONG',
        message: SUMMARY_INPUT_TOO_LONG_MESSAGE,
      };
    }

    if (error instanceof NotFoundException) {
      return {
        code: 'SUMMARY_THREAD_UNAVAILABLE',
        message: '댓글 스레드를 찾을 수 없어 요약을 생성하지 못했습니다.',
      };
    }

    return {
      code: 'SUMMARY_GENERATION_FAILED',
      message: '댓글 요약 생성 중 오류가 발생했습니다.',
    };
  }
}
