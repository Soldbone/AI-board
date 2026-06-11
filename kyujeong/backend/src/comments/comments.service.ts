import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(
    postId: number,
    createCommentDto: CreateCommentDto,
    authorId: number,
  ) {
    const post = await this.prismaService.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return {
      postId,
      content: createCommentDto.content,
      authorId,
    };
  }
}
