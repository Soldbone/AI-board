import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FoodMetadataModule } from '../food-metadata/food-metadata.module';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { PostDraftAgentRunner } from './post-draft-agent.runner';
import { AnalyzeFoodMetadataTool } from './tools/analyze-food-metadata.tool';
import { ExtractIngredientsTool } from './tools/extract-ingredients.tool';
import { RewritePostDraftTool } from './tools/rewrite-post-draft.tool';

@Module({
  imports: [AuthModule, FoodMetadataModule],
  controllers: [AiAgentController],
  providers: [
    AiAgentService,
    PostDraftAgentRunner,
    ExtractIngredientsTool,
    AnalyzeFoodMetadataTool,
    RewritePostDraftTool,
  ],
})
export class AiAgentModule {}
