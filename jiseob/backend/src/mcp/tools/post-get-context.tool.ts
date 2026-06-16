import { Injectable } from '@nestjs/common';
import { PostsService } from '../../posts/posts.service';
import { assertPlainObject, readRequiredString } from '../mcp.validation';
import { McpTool, McpToolDefinition } from '../mcp.types';

@Injectable()
export class PostGetContextTool implements McpTool {
  readonly definition: McpToolDefinition = {
    name: 'post.getContext',
    description: '게시글 본문, 태그, 영상 요약 상태, 카운터를 조회한다.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      required: ['postId'],
      additionalProperties: false,
      properties: {
        postId: { type: 'string' },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        commentCount: { type: 'number' },
        viewCount: { type: 'number' },
        likeCount: { type: 'number' },
        video: { type: 'object' },
        tags: { type: 'array' },
      },
    },
  };

  constructor(private readonly postsService: PostsService) {}

  async execute(args: unknown) {
    const parsedArgs = assertPlainObject(args);
    const postId = readRequiredString(parsedArgs, 'postId');

    return this.postsService.getPost(postId);
  }
}
