import { Injectable } from '@nestjs/common';
import { VideosService } from '../../videos/videos.service';
import { assertPlainObject, readRequiredString } from '../mcp.validation';
import { McpTool, McpToolDefinition } from '../mcp.types';

@Injectable()
export class VideoGetProcessingStatusTool implements McpTool {
  readonly definition: McpToolDefinition = {
    name: 'video.getProcessingStatus',
    description: '영상 메타데이터, 자막, 임베딩 처리 상태를 조회한다.',
    readOnly: true,
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
        id: { type: 'string' },
        youtubeVideoId: { type: 'string' },
        metadataStatus: { type: 'string' },
        transcriptStatus: { type: 'string' },
        embeddingStatus: { type: 'string' },
        isProcessing: { type: 'boolean' },
      },
    },
  };

  constructor(private readonly videosService: VideosService) {}

  async execute(args: unknown) {
    const parsedArgs = assertPlainObject(args);
    const videoId = readRequiredString(parsedArgs, 'videoId');

    return this.videosService.getVideo(videoId);
  }
}
