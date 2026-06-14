import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { CommonModule } from '../common/common.module';
import { Post } from '../posts/entities/post.entity';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { Comment } from './entities/comment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Post]), CommonModule, AiModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
