import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '../comments/entities/comment.entity';
import {
  CommentAnalyzerProvider,
  RuleBasedCommentAnalyzerProvider,
} from './comment-analysis/comment-analyzer.provider';
import { CommentAnalysisService } from './comment-analysis/comment-analysis.service';
import { CommentAnalysis } from './comment-analysis/entities/comment-analysis.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CommentAnalysis, Comment])],
  providers: [
    CommentAnalysisService,
    {
      provide: CommentAnalyzerProvider,
      useClass: RuleBasedCommentAnalyzerProvider,
    },
  ],
  exports: [CommentAnalysisService],
})
export class AiModule {}
