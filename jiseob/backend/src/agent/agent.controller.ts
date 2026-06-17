import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AgentService } from './agent.service';
import { CreateAgentRunDto } from './dto/create-agent-run.dto';

@Controller()
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('posts/:postId/agent/runs')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  createRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Body() createAgentRunDto: CreateAgentRunDto,
  ) {
    return this.agentService.createRun(user, postId, createAgentRunDto);
  }

  @Get('agent/runs/:runId')
  @UseGuards(JwtAuthGuard)
  getRun(@CurrentUser() user: AuthenticatedUser, @Param('runId') runId: string) {
    return this.agentService.getRun(user, runId);
  }
}
