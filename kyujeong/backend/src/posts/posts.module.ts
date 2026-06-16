import { Module } from '@nestjs/common';
import { AiRecommendationsModule } from '../ai-recommendations/ai-recommendations.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [PrismaModule, AuthModule, AiRecommendationsModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
