import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PostsModule } from './posts/posts.module';
import { CommentsModule } from './comments/comments.module';
import { AiRecommendationsModule } from './ai-recommendations/ai-recommendations.module';
import { FoodMetadataModule } from './food-metadata/food-metadata.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    PostsModule,
    CommentsModule,
    AiRecommendationsModule,
    AiAgentModule,
    FoodMetadataModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
