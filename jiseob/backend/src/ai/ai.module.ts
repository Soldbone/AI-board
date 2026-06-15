import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '../comments/entities/comment.entity';
import { Post } from '../posts/entities/post.entity';
import { TranscriptChunk } from '../videos/entities/transcript-chunk.entity';
import { Video } from '../videos/entities/video.entity';
import { EmbeddingProvider, OpenAiEmbeddingProvider } from '../videos/providers/embedding.provider';
import {
  CommentAnalyzerProvider,
  RuleBasedCommentAnalyzerProvider,
} from './comment-analysis/comment-analyzer.provider';
import { CommentAnalysisService } from './comment-analysis/comment-analysis.service';
import { CommentAnalysis } from './comment-analysis/entities/comment-analysis.entity';
import { OpenAiCommentAnalyzerProvider } from './comment-analysis/openai-comment-analyzer.provider';
import { RagEvidence } from './rag/entities/rag-evidence.entity';
import { RagController } from './rag/rag.controller';
import { RagService } from './rag/rag.service';
import { AiSummary } from './summary/entities/ai-summary.entity';
import { OpenAiSummaryProvider } from './summary/openai-summary.provider';
import { SummaryController } from './summary/summary.controller';
import { SummaryProvider } from './summary/summary.provider';
import { SummaryService } from './summary/summary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommentAnalysis,
      RagEvidence,
      AiSummary,
      Comment,
      Post,
      Video,
      TranscriptChunk,
    ]),
  ],
  controllers: [RagController, SummaryController],
  providers: [
    CommentAnalysisService,
    RagService,
    SummaryService,
    RuleBasedCommentAnalyzerProvider,
    {
      provide: CommentAnalyzerProvider,
      useClass: OpenAiCommentAnalyzerProvider,
    },
    {
      provide: SummaryProvider,
      useClass: OpenAiSummaryProvider,
    },
    {
      provide: EmbeddingProvider,
      useClass: OpenAiEmbeddingProvider,
    },
  ],
  exports: [CommentAnalysisService, RagService, SummaryService, EmbeddingProvider],
})
export class AiModule {}
