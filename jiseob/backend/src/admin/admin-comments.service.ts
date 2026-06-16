import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { CommentAnalysisService } from '../ai/comment-analysis/comment-analysis.service';
import { CommentAnalysis } from '../ai/comment-analysis/entities/comment-analysis.entity';
import { AiAnalysisStatus, CommentType, RagStatus } from '../common/enums/ai-status.enum';
import { ModerationStatus } from '../common/enums/comment-status.enum';
import { Comment } from '../comments/entities/comment.entity';
import { Post } from '../posts/entities/post.entity';
import { User } from '../users/entities/user.entity';
import { FindAdminCommentsQueryDto } from './dto/find-admin-comments-query.dto';

type AdminCommentAuthorResponse = {
  id: string;
  nickname: string;
};

type AdminCommentAnalysisResponse = {
  commentType: CommentType | null;
  aiAnalysisStatus: AiAnalysisStatus;
  ragStatus: RagStatus;
  evidenceCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  analyzedAt: Date | null;
};

export type AdminCommentResponse = {
  id: string;
  postId: string;
  parentCommentId: string | null;
  content: string;
  moderationStatus: ModerationStatus;
  author: AdminCommentAuthorResponse;
  analysis: AdminCommentAnalysisResponse | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminCommentListResponse = {
  items: AdminCommentResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type AdminAnalysisRetryResponse = {
  commentId: string;
  accepted: true;
  aiAnalysisStatus: AiAnalysisStatus.PENDING;
};

type AdminCommentWithRelations = Comment & {
  author?: User | null;
  analysis?: CommentAnalysis | null;
};

@Injectable()
export class AdminCommentsService {
  private readonly logger = new Logger(AdminCommentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly commentAnalysisService: CommentAnalysisService,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(CommentAnalysis)
    private readonly analysesRepository: Repository<CommentAnalysis>,
  ) {}

  async findReviewComments(query: FindAdminCommentsQueryDto): Promise<AdminCommentListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const moderationStatus = query.moderationStatus ?? ModerationStatus.NEEDS_REVIEW;

    const queryBuilder = this.commentsRepository
      .createQueryBuilder('comment')
      .innerJoin('comment.post', 'post', 'post.deleted_at IS NULL')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.analysis', 'analysis')
      .where('comment.deleted_at IS NULL')
      .andWhere('comment.moderation_status = :moderationStatus', { moderationStatus })
      .orderBy('comment.createdAt', 'ASC')
      .addOrderBy('comment.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [comments, total] = await queryBuilder.getManyAndCount();

    return {
      items: (comments as AdminCommentWithRelations[]).map((comment) =>
        this.toCommentResponse(comment),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const comment = await this.findCommentWithDeletedOrThrow(commentId, manager);

      await this.findActivePostOrThrow(comment.postId, manager);

      if (comment.deletedAt) {
        return;
      }

      await manager.getRepository(Comment).update(comment.id, {
        moderationStatus: ModerationStatus.DELETED_BY_ADMIN,
      });
      await manager.getRepository(Comment).softDelete(comment.id);
      await this.decreaseCommentCount(comment.postId, manager);
    });
  }

  async retryCommentAnalysis(commentId: string): Promise<AdminAnalysisRetryResponse> {
    await this.dataSource.transaction(async (manager) => {
      const comment = await this.findActiveCommentOrThrow(commentId, manager);

      await this.findActivePostOrThrow(comment.postId, manager);

      const analysis = await manager.getRepository(CommentAnalysis).findOne({
        where: { commentId },
      });

      if (!analysis) {
        throw new NotFoundException('댓글 분석 결과를 찾을 수 없습니다.');
      }

      if (analysis.aiAnalysisStatus !== AiAnalysisStatus.FAILED) {
        throw new ConflictException('실패한 댓글 분석만 재시도할 수 있습니다.');
      }

      await this.commentAnalysisService.preparePendingAnalysis(commentId, manager);
    });

    this.enqueueCommentAnalysis(commentId);

    return {
      commentId,
      accepted: true,
      aiAnalysisStatus: AiAnalysisStatus.PENDING,
    };
  }

  private async findActivePostOrThrow(postId: string, manager?: EntityManager): Promise<Post> {
    const repository = manager?.getRepository(Post) ?? this.postsRepository;
    const post = await repository.findOne({
      where: { id: postId, deletedAt: IsNull() },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }

    return post;
  }

  private async findActiveCommentOrThrow(
    commentId: string,
    manager?: EntityManager,
  ): Promise<Comment> {
    const repository = manager?.getRepository(Comment) ?? this.commentsRepository;
    const comment = await repository.findOne({
      where: { id: commentId, deletedAt: IsNull() },
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    return comment;
  }

  private async findCommentWithDeletedOrThrow(
    commentId: string,
    manager?: EntityManager,
  ): Promise<Comment> {
    const repository = manager?.getRepository(Comment) ?? this.commentsRepository;
    const comment = await repository.findOne({
      where: { id: commentId },
      withDeleted: true,
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    return comment;
  }

  private async decreaseCommentCount(postId: string, manager: EntityManager): Promise<void> {
    await manager
      .getRepository(Post)
      .createQueryBuilder()
      .update(Post)
      .set({ commentCount: () => 'GREATEST("comment_count" - 1, 0)' })
      .where('"id" = :postId', { postId })
      .andWhere('"deleted_at" IS NULL')
      .execute();
  }

  private enqueueCommentAnalysis(commentId: string): void {
    void this.commentAnalysisService.analyzeComment(commentId).catch((error: unknown) => {
      this.logger.warn(
        `Admin retry comment analysis failed after enqueue: ${commentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  private toCommentResponse(comment: AdminCommentWithRelations): AdminCommentResponse {
    return {
      id: comment.id,
      postId: comment.postId,
      parentCommentId: comment.parentCommentId ?? null,
      content: comment.content,
      moderationStatus: comment.moderationStatus,
      author: this.toAuthorResponse(comment),
      analysis: this.toAnalysisResponse(comment.analysis ?? null),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  private toAnalysisResponse(
    analysis: CommentAnalysis | null,
  ): AdminCommentAnalysisResponse | null {
    if (!analysis) {
      return null;
    }

    return {
      commentType: analysis.commentType ?? null,
      aiAnalysisStatus: analysis.aiAnalysisStatus,
      ragStatus: analysis.ragStatus,
      evidenceCount: analysis.evidenceCount,
      errorCode: analysis.errorCode ?? null,
      errorMessage: analysis.errorMessage ?? null,
      analyzedAt: analysis.analyzedAt ?? null,
    };
  }

  private toAuthorResponse(comment: AdminCommentWithRelations): AdminCommentAuthorResponse {
    if (!comment.author || comment.author.deletedAt) {
      return {
        id: comment.authorId,
        nickname: '탈퇴한 회원',
      };
    }

    return {
      id: comment.author.id,
      nickname: comment.author.nickname,
    };
  }
}
