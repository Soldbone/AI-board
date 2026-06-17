import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { TagsModule } from '../tags/tags.module';
import { VideosModule } from '../videos/videos.module';
import { PostLike } from './entities/post-like.entity';
import { PostTag } from './entities/post-tag.entity';
import { Post } from './entities/post.entity';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, PostTag, PostLike]),
    CommonModule,
    VideosModule,
    TagsModule,
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
