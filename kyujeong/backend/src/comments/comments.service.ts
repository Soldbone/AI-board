import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll(postId: number) {
    const post = await this.prismaService.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return this.prismaService.comment.findMany({
      where: { postId },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        content: true,
        postId: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            nickname: true,
          },
        },
      },
    });
  }

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

    return this.prismaService.comment.create({
      data: {
        content: createCommentDto.content,
        postId,
        authorId,
      },
      select: {
        id: true,
        content: true,
        postId: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            nickname: true,
          },
        },
      },
    });
  }
}
