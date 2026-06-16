import { Injectable } from '@nestjs/common';
import { YoutubeMetadataProvider } from '../../videos/providers/youtube-metadata.provider';
import { assertPlainObject, readRequiredString } from '../mcp.validation';
import { McpTool, McpToolDefinition } from '../mcp.types';

const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

@Injectable()
export class YoutubeFetchMetadataTool implements McpTool {
  readonly definition: McpToolDefinition = {
    name: 'youtube.fetchMetadata',
    description: 'YouTube Data API v3로 영상 메타데이터를 조회한다. DB는 수정하지 않는다.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      required: ['youtubeVideoId'],
      additionalProperties: false,
      properties: {
        youtubeVideoId: {
          type: 'string',
          pattern: YOUTUBE_VIDEO_ID_PATTERN.source,
        },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        youtubeVideoId: { type: 'string' },
        title: { type: 'string' },
        channelName: { type: 'string' },
        thumbnailUrl: { type: 'string' },
        publishedAt: { type: 'string' },
        description: { type: 'string' },
        youtubeViewCount: { type: 'number' },
        youtubeLikeCount: { type: 'number' },
        youtubeCommentCount: { type: 'number' },
      },
    },
  };

  constructor(private readonly youtubeMetadataProvider: YoutubeMetadataProvider) {}

  async execute(args: unknown) {
    const parsedArgs = assertPlainObject(args);
    const youtubeVideoId = readRequiredString(parsedArgs, 'youtubeVideoId', {
      pattern: YOUTUBE_VIDEO_ID_PATTERN,
    });
    const metadata = await this.youtubeMetadataProvider.fetchMetadata(youtubeVideoId);

    return {
      youtubeVideoId,
      ...metadata,
    };
  }
}
