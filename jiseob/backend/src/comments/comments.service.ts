import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { CommentAnalysisService } from '../ai/comment-analysis/comment-analysis.service';
import { CommentAnalysis } from '../ai/comment-analysis/entities/comment-analysis.entity';
import { AiAnalysisStatus, CommentType, RagStatus } from '../common/enums/ai-status.enum';
import { ModerationStatus } from '../common/enums/comment-status.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Post } from '../posts/entities/post.entity';
import { User } from '../users/entities/user.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './entities/comment.entity';

type CommentAuthorResponse = {
  id: string;
  nickname: string;
};

type CommentAnalysisResponse = {
  commentType: CommentType | null;
  aiAnalysisStatus: AiAnalysisStatus;
  ragStatus: RagStatus;
  evidenceCount: number;
  analyzedAt: Date | null;
};

export type CommentResponse = {
  id: string;
  postId: string;
  parentCommentId: string | null;
  content: string;
  moderationStatus: ModerationStatus;
  analysis: CommentAnalysisResponse | null;
  isDeleted: boolean;
  author: CommentAuthorResponse;
  replies: CommentResponse[];
  createdAt: Date;
  updatedAt: Date;
};

type CommentWithAuthor = Comment & {
  author: User | null;
  analysis?: CommentAnalysis | null;
};

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly commentAnalysisService: CommentAnalysisService,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
  ) {}

  async findComments(postId: string): Promise<CommentResponse[]> {
    await this.findActivePostOrThrow(postId);

    const comments = await this.commentsRepository
      .createQueryBuilder('comment')
      .withDeleted()
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.analysis', 'analysis')
      .where('comment.post_id = :postId', { postId })
      .orderBy('comment.createdAt', 'ASC')
      .getMany();

    return this.toThreadResponse(comments as CommentWithAuthor[]);
  }

  async createComment(
    user: AuthenticatedUser,
    postId: string,
    createCommentDto: CreateCommentDto,
  ): Promise<CommentResponse> {
    const content = this.normalizeContent(createCommentDto.content);
    const commentId = await this.dataSource.transaction(async (manager) => {
      await this.findActivePostOrThrow(postId, manager);

      const comment = await manager.getRepository(Comment).save(
        manager.getRepository(Comment).create({
          postId,
          authorId: user.id,
          content,
          moderationStatus: ModerationStatus.NORMAL,
        }),
      );

      await this.increaseCommentCount(postId, manager);
      await this.commentAnalysisService.preparePendingAnalysis(comment.id, manager);

      return comment.id;
    });

    const response = await this.getComment(commentId);

    this.enqueueCommentAnalysis(commentId);

    return response;
  }

  async createReply(
    user: AuthenticatedUser,
    parentCommentId: string,
    createReplyDto: CreateReplyDto,
  ): Promise<CommentResponse> {
    const content = this.normalizeContent(createReplyDto.content);
    const commentId = await this.dataSource.transaction(async (manager) => {
      const parentComment = await this.findActiveCommentOrThrow(parentCommentId, manager);

      if (parentComment.parentCommentId) {
        throw new BadRequestException('대댓글에는 답글을 작성할 수 없습니다.');
      }

      await this.findActivePostOrThrow(parentComment.postId, manager);

      const comment = await manager.getRepository(Comment).save(
        manager.getRepository(Comment).create({
          postId: parentComment.postId,
          authorId: user.id,
          parentCommentId: parentComment.id,
          content,
          moderationStatus: ModerationStatus.NORMAL,
        }),
      );

      await this.increaseCommentCount(parentComment.postId, manager);
      await this.commentAnalysisService.preparePendingAnalysis(comment.id, manager);

      return comment.id;
    });

    const response = await this.getComment(commentId);

    this.enqueueCommentAnalysis(commentId);

    return response;
  }

  async updateComment(
    user: AuthenticatedUser,
    commentId: string,
    updateCommentDto: UpdateCommentDto,
  ): Promise<CommentResponse> {
    const content = this.normalizeContent(updateCommentDto.content);

    await this.dataSource.transaction(async (manager) => {
      const comment = await this.findActiveCommentOrThrow(commentId, manager);

      await this.findActivePostOrThrow(comment.postId, manager);
      this.assertAuthor(comment, user.id);

      comment.content = content;
      comment.moderationStatus = ModerationStatus.NORMAL;
      await manager.getRepository(Comment).save(comment);
      await this.commentAnalysisService.preparePendingAnalysis(comment.id, manager);
    });

    const response = await this.getComment(commentId);

    this.enqueueCommentAnalysis(commentId);

    return response;
  }

  async deleteComment(user: AuthenticatedUser, commentId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const comment = await this.findCommentWithDeletedOrThrow(commentId, manager);

      await this.findActivePostOrThrow(comment.postId, manager);
      this.assertAuthor(comment, user.id);

      if (comment.deletedAt) {
        return;
      }

      await manager.getRepository(Comment).update(comment.id, {
        moderationStatus: ModerationStatus.DELETED_BY_USER,
      });
      await manager.getRepository(Comment).softDelete(comment.id);
      await this.decreaseCommentCount(comment.postId, manager);
    });
  }

  private async getComment(commentId: string): Promise<CommentResponse> {
    const comment = await this.commentsRepository
      .createQueryBuilder('comment')
      .withDeleted()
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.analysis', 'analysis')
      .where('comment.id = :commentId', { commentId })
      .getOne();

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    return this.toCommentResponse(comment as CommentWithAuthor, []);
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

  private async increaseCommentCount(postId: string, manager: EntityManager): Promise<void> {
    await manager
      .getRepository(Post)
      .createQueryBuilder()
      .update(Post)
      .set({ commentCount: () => '"comment_count" + 1' })
      .where('"id" = :postId', { postId })
      .andWhere('"deleted_at" IS NULL')
      .execute();
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

  private assertAuthor(comment: Comment, userId: string): void {
    if (comment.authorId !== userId) {
      throw new ForbiddenException('댓글에 대한 권한이 없습니다.');
    }
  }

  private enqueueCommentAnalysis(commentId: string): void {
    void this.commentAnalysisService.analyzeComment(commentId).catch((error: unknown) => {
      this.logger.warn(
        `Comment analysis failed after comment write: ${commentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  private normalizeContent(content: string): string {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      throw new BadRequestException('댓글 내용을 입력해주세요.');
    }

    return normalizedContent;
  }

  private toThreadResponse(comments: CommentWithAuthor[]): CommentResponse[] {
    const repliesByParentId = new Map<string, CommentWithAuthor[]>();
    const rootComments: CommentWithAuthor[] = [];

    for (const comment of comments) {
      if (comment.parentCommentId) {
        const replies = repliesByParentId.get(comment.parentCommentId) ?? [];
        replies.push(comment);
        repliesByParentId.set(comment.parentCommentId, replies);
        continue;
      }

      rootComments.push(comment);
    }

    return rootComments.map((comment) =>
      this.toCommentResponse(comment, repliesByParentId.get(comment.id) ?? []),
    );
  }

  private toCommentResponse(
    comment: CommentWithAuthor,
    replies: CommentWithAuthor[],
  ): CommentResponse {
    const isDeleted = Boolean(comment.deletedAt);

    return {
      id: comment.id,
      postId: comment.postId,
      parentCommentId: comment.parentCommentId ?? null,
      content: isDeleted ? this.getDeletedContent(comment.moderationStatus) : comment.content,
      moderationStatus: comment.moderationStatus,
      analysis: this.toAnalysisResponse(comment.analysis ?? null),
      isDeleted,
      author: this.toAuthorResponse(comment),
      replies: replies.map((reply) => this.toCommentResponse(reply, [])),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  private toAnalysisResponse(analysis: CommentAnalysis | null): CommentAnalysisResponse | null {
    if (!analysis) {
      return null;
    }

    return {
      commentType: analysis.commentType ?? null,
      aiAnalysisStatus: analysis.aiAnalysisStatus,
      ragStatus: analysis.ragStatus,
      evidenceCount: analysis.evidenceCount,
      analyzedAt: analysis.analyzedAt ?? null,
    };
  }

  private getDeletedContent(moderationStatus: ModerationStatus): string {
    if (moderationStatus === ModerationStatus.DELETED_BY_ADMIN) {
      return '관리자에 의해 삭제된 댓글입니다';
    }

    return '삭제된 댓글입니다';
  }

  private toAuthorResponse(comment: CommentWithAuthor): CommentAuthorResponse {
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
