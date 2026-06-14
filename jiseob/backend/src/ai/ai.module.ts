import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '../comments/entities/comment.entity';
import {
  CommentAnalyzerProvider,
  RuleBasedCommentAnalyzerProvider,
} from './comment-analysis/comment-analyzer.provider';
import { CommentAnalysisService } from './comment-analysis/comment-analysis.service';
import { CommentAnalysis } from './comment-analysis/entities/comment-analysis.entity';
import { OpenAiCommentAnalyzerProvider } from './comment-analysis/openai-comment-analyzer.provider';

@Module({
  imports: [TypeOrmModule.forFeature([CommentAnalysis, Comment])],
  providers: [
    CommentAnalysisService,
    RuleBasedCommentAnalyzerProvider,
    {
      provide: CommentAnalyzerProvider,
      useClass: OpenAiCommentAnalyzerProvider,
    },
  ],
  exports: [CommentAnalysisService],
})
export class AiModule {}
