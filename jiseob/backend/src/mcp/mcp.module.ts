import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommonModule } from '../common/common.module';
import { PostsModule } from '../posts/posts.module';
import { VideosModule } from '../videos/videos.module';
import { McpController } from './mcp.controller';
import { McpServerService } from './mcp-server.service';
import { MCP_TOOLS, McpTool } from './mcp.types';
import { PostGetContextTool } from './tools/post-get-context.tool';
import { TranscriptSearchChunksTool } from './tools/transcript-search-chunks.tool';
import { VideoGetProcessingStatusTool } from './tools/video-get-processing-status.tool';
import { VideoRetryProcessingTool } from './tools/video-retry-processing.tool';
import { YoutubeFetchMetadataTool } from './tools/youtube-fetch-metadata.tool';

const MCP_TOOL_PROVIDERS = [
  YoutubeFetchMetadataTool,
  VideoGetProcessingStatusTool,
  VideoRetryProcessingTool,
  PostGetContextTool,
  TranscriptSearchChunksTool,
];

@Module({
  imports: [CommonModule, VideosModule, PostsModule, AiModule],
  controllers: [McpController],
  providers: [
    McpServerService,
    ...MCP_TOOL_PROVIDERS,
    {
      provide: MCP_TOOLS,
      useFactory: (...tools: McpTool[]) => tools,
      inject: MCP_TOOL_PROVIDERS,
    },
  ],
  exports: [McpServerService],
})
export class McpModule {}
