import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prismaService: PrismaService) {}

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
