import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentAnalysis } from '../ai/comment-analysis/entities/comment-analysis.entity';
import { AiModule } from '../ai/ai.module';
import { CommonModule } from '../common/common.module';
import { Comment } from '../comments/entities/comment.entity';
import { Post } from '../posts/entities/post.entity';
import { AdminCommentsController } from './admin-comments.controller';
import { AdminCommentsService } from './admin-comments.service';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Post, CommentAnalysis]), CommonModule, AiModule],
  controllers: [AdminCommentsController],
  providers: [AdminCommentsService],
})
export class AdminModule {}
