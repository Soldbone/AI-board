import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { Comment } from '../../comments/entities/comment.entity';
import { AiAnalysisStatus, CommentType, RagStatus } from '../../common/enums/ai-status.enum';
import {
  CommentAnalyzerError,
  CommentAnalyzerProvider,
  CommentAnalysisResult,
} from './comment-analyzer.provider';
import { CommentAnalysis } from './entities/comment-analysis.entity';
import { RagEvidence } from '../rag/entities/rag-evidence.entity';
import { RagService } from '../rag/rag.service';

@Injectable()
export class CommentAnalysisService {
  private readonly logger = new Logger(CommentAnalysisService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly analyzerProvider: CommentAnalyzerProvider,
    private readonly ragService: RagService,
    @InjectRepository(CommentAnalysis)
    private readonly analysesRepository: Repository<CommentAnalysis>,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
  ) {}

  async preparePendingAnalysis(commentId: string, manager?: EntityManager): Promise<void> {
    const repository = manager?.getRepository(CommentAnalysis) ?? this.analysesRepository;
    const existingAnalysis = await repository.findOne({
      where: { commentId },
    });

    const pendingValues: Partial<CommentAnalysis> = {
      commentId,
      commentType: null,
      aiAnalysisStatus: AiAnalysisStatus.PENDING,
      ragStatus: RagStatus.NOT_REQUIRED,
      evidenceCount: 0,
      analyzedAt: null,
      errorCode: null,
      errorMessage: null,
      ragErrorCode: null,
      ragErrorMessage: null,
    };

    await repository.manager.getRepository(RagEvidence).delete({ commentId });

    if (existingAnalysis) {
      await repository.update(existingAnalysis.id, pendingValues);
      return;
    }

    await repository.save(repository.create(pendingValues));
  }

  async analyzeComment(commentId: string): Promise<void> {
    const comment = await this.commentsRepository.findOne({
      where: { id: commentId, deletedAt: IsNull() },
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    try {
      const result = await this.analyzerProvider.analyze(comment.content);

      await this.storeAnalysisSuccess(comment, result);

      if (result.commentType === CommentType.FACT_CLAIM) {
        this.ragService.enqueueForComment(comment.id);
      }
    } catch (error) {
      const analyzerError = this.toAnalyzerError(error);

      this.logger.warn(`Comment analysis failed for ${commentId}: ${analyzerError.message}`);
      await this.analysesRepository.update(
        { commentId },
        {
          aiAnalysisStatus: AiAnalysisStatus.FAILED,
          errorCode: analyzerError.code,
          errorMessage: analyzerError.userMessage,
          analyzedAt: new Date(),
        },
      );
    }
  }

  private async storeAnalysisSuccess(
    comment: Comment,
    result: CommentAnalysisResult,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Comment).update(comment.id, {
        moderationStatus: result.moderationStatus,
      });

      await manager.getRepository(CommentAnalysis).update(
        { commentId: comment.id },
        {
          commentType: result.commentType,
          aiAnalysisStatus: AiAnalysisStatus.SUCCESS,
          ragStatus: this.getNextRagStatus(result.commentType),
          evidenceCount: 0,
          analyzedAt: new Date(),
          errorCode: null,
          errorMessage: null,
          ragErrorCode: null,
          ragErrorMessage: null,
        },
      );
    });
  }

  private getNextRagStatus(commentType: CommentType): RagStatus {
    return commentType === CommentType.FACT_CLAIM ? RagStatus.PENDING : RagStatus.NOT_REQUIRED;
  }

  private toAnalyzerError(error: unknown): CommentAnalyzerError {
    if (error instanceof CommentAnalyzerError) {
      return error;
    }

    return new CommentAnalyzerError(
      'COMMENT_ANALYSIS_FAILED',
      '댓글 분석을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.',
      error instanceof Error ? error.message : undefined,
    );
  }
}
