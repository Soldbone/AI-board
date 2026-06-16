import { Injectable } from '@nestjs/common';
import { VideosService } from '../../videos/videos.service';
import { assertPlainObject, readRequiredString } from '../mcp.validation';
import { McpTool, McpToolContext, McpToolDefinition } from '../mcp.types';

@Injectable()
export class VideoRetryProcessingTool implements McpTool {
  readonly definition: McpToolDefinition = {
    name: 'video.retryProcessing',
    description: '실패한 영상 처리를 재시도한다. 작성자 또는 관리자만 호출할 수 있다.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      required: ['videoId'],
      additionalProperties: false,
      properties: {
        videoId: { type: 'string' },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        videoId: { type: 'string' },
        accepted: { type: 'boolean' },
        video: { type: 'object' },
      },
    },
  };

  constructor(private readonly videosService: VideosService) {}

  async execute(args: unknown, context: McpToolContext) {
    const parsedArgs = assertPlainObject(args);
    const videoId = readRequiredString(parsedArgs, 'videoId');
    const accepted = await this.videosService.retryProcessing(context.user, videoId);
    const video = await this.videosService.getVideo(videoId);

    return {
      ...accepted,
      video,
    };
  }
}
