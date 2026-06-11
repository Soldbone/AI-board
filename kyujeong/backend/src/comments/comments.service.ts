import { Injectable } from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  create(
    postId: number,
    createCommentDto: CreateCommentDto,
    authorId: number,
  ) {
    return {
      postId,
      content: createCommentDto.content,
      authorId,
    };
  }
}
