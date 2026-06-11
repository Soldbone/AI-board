import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  let service: CommentsService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        {
          provide: PrismaService,
          useValue: {
            post: {
              findUnique: jest.fn(),
            },
            comment: {
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a comment when post exists', async () => {
    const createCommentDto = {
      content: 'Test comment',
    };
    const createdComment = {
      id: 1,
      content: createCommentDto.content,
      postId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: {
        nickname: 'tester',
      },
    };

    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue({ id: 1 });
    jest.spyOn(prismaService.comment, 'create').mockResolvedValue(createdComment);

    await expect(service.create(1, createCommentDto, 2)).resolves.toBe(
      createdComment,
    );
    expect(prismaService.post.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
      },
    });
    expect(prismaService.comment.create).toHaveBeenCalledWith({
      data: {
        content: createCommentDto.content,
        postId: 1,
        authorId: 2,
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
  });

  it('should throw NotFoundException when post does not exist', async () => {
    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue(null);

    await expect(
      service.create(
        999,
        {
          content: 'Test comment',
        },
        2,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
