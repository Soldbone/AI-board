import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll(page: number, size: number) {
    const currentPage = Math.max(page, 1);
    const pageSize = Math.max(size, 1);

    return this.prismaService.post.findMany({
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        author: {
          select: {
            nickname: true,
          },
        },
      },
    });
  }

  async create(createPostDto: CreatePostDto, authorId: number) {
    return this.prismaService.post.create({
      data: {
        title: createPostDto.title,
        content: createPostDto.content,
        authorId,
      },
    });
  }
}
