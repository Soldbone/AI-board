import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiRecommendationsController } from './ai-recommendations.controller';
import { AiRecommendationsService } from './ai-recommendations.service';
import { EmbeddingService } from './embedding.service';
import { RecipeLlmService } from './recipe-llm.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AiRecommendationsController],
  providers: [AiRecommendationsService, EmbeddingService, RecipeLlmService],
})
export class AiRecommendationsModule {}
