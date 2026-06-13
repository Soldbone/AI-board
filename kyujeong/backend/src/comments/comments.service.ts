import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

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
            id: true,
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

    const comment = await this.prismaService.comment.create({
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
            id: true,
            nickname: true,
          },
        },
      },
    });

    await this.markPostAiRecommendationStale(postId);

    return comment;
  }

  async update(
    id: number,
    updateCommentDto: UpdateCommentDto,
    userId: number,
  ) {
    const comment = await this.prismaService.comment.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only update your own comment');
    }

    const updatedComment = await this.prismaService.comment.update({
      where: { id },
      data: {
        content: updateCommentDto.content,
      },
      select: {
        id: true,
        content: true,
        postId: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    await this.markPostAiRecommendationStale(updatedComment.postId);

    return updatedComment;
  }

  async remove(id: number, userId: number) {
    const comment = await this.prismaService.comment.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own comment');
    }

    const deletedComment = await this.prismaService.comment.delete({
      where: { id },
      select: {
        postId: true,
      },
    });

    await this.markPostAiRecommendationStale(deletedComment.postId);

    return { id };
  }

  private async markPostAiRecommendationStale(postId: number) {
    await this.prismaService.$transaction([
      this.prismaService.postRagDocument.updateMany({
        where: { postId },
        data: { isStale: true },
      }),
      this.prismaService.aiRecipeRecommendation.updateMany({
        where: { postId },
        data: { status: 'STALE' },
      }),
    ]);
  }
}
