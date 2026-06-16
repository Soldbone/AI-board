import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { McpModule } from '../mcp/mcp.module';
import { PostsModule } from '../posts/posts.module';
import { AgentController } from './agent.controller';
import { AgentLlmProvider, OpenAiAgentLlmProvider } from './agent-llm.provider';
import { AgentMcpCallerService } from './agent-mcp-caller.service';
import { AgentService } from './agent.service';
import { AgentRun } from './entities/agent-run.entity';
import { AgentStep } from './entities/agent-step.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentRun, AgentStep]),
    CommonModule,
    PostsModule,
    McpModule,
    ConfigModule,
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentMcpCallerService,
    {
      provide: AgentLlmProvider,
      useClass: OpenAiAgentLlmProvider,
    },
  ],
})
export class AgentModule {}
