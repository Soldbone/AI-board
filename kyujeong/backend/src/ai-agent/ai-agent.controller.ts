import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { AiAgentService } from './ai-agent.service';
import { AssistPostDraftDto } from './dto/assist-post-draft.dto';

@Controller()
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @UseGuards(JwtAuthGuard)
  @Post(['agent/post-draft/assist', 'api/agent/post-draft/assist'])
  assistPostDraft(@Body() assistPostDraftDto: AssistPostDraftDto) {
    return this.aiAgentService.assistPostDraft(assistPostDraftDto);
  }
}
