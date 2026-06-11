import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll(page: number, size: number, search?: string) {
    const currentPage = Math.max(page, 1);
    const pageSize = Math.max(size, 1);
    const keyword = search?.trim();

    return this.prismaService.post.findMany({
      where: keyword
        ? {
            title: {
              contains: keyword,
              mode: 'insensitive',
            },
          }
        : undefined,
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

  findOne(id: number) {
    return { id };
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
