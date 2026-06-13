import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
            $transaction: jest.fn((operations) => Promise.all(operations)),
            post: {
              findUnique: jest.fn(),
            },
            comment: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            postRagDocument: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            aiRecipeRecommendation: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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

  it('should return comments for an existing post', async () => {
    const comments = [
      {
        id: 1,
        content: 'Test comment',
        postId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: {
          id: 2,
          nickname: 'tester',
        },
      },
    ];

    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue({ id: 1 });
    jest.spyOn(prismaService.comment, 'findMany').mockResolvedValue(comments);

    await expect(service.findAll(1)).resolves.toBe(comments);
    expect(prismaService.post.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
      },
    });
    expect(prismaService.comment.findMany).toHaveBeenCalledWith({
      where: { postId: 1 },
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
  });

  it('should throw NotFoundException when listing comments for a missing post', async () => {
    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue(null);

    await expect(service.findAll(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
        id: 2,
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
            id: true,
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

  it('should update a comment when user is the author', async () => {
    const updateCommentDto = {
      content: 'Updated comment',
    };
    const updatedComment = {
      id: 1,
      content: updateCommentDto.content,
      postId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: {
        id: 2,
        nickname: 'tester',
      },
    };

    jest.spyOn(prismaService.comment, 'findUnique').mockResolvedValue({
      id: 1,
      authorId: 2,
    });
    jest
      .spyOn(prismaService.comment, 'update')
      .mockResolvedValue(updatedComment);

    await expect(service.update(1, updateCommentDto, 2)).resolves.toBe(
      updatedComment,
    );
    expect(prismaService.comment.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
        authorId: true,
      },
    });
    expect(prismaService.comment.update).toHaveBeenCalledWith({
      where: { id: 1 },
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
  });

  it('should throw NotFoundException when comment does not exist', async () => {
    jest.spyOn(prismaService.comment, 'findUnique').mockResolvedValue(null);

    await expect(
      service.update(
        999,
        {
          content: 'Updated comment',
        },
        2,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should throw ForbiddenException when user is not the comment author', async () => {
    jest.spyOn(prismaService.comment, 'findUnique').mockResolvedValue({
      id: 1,
      authorId: 2,
    });

    await expect(
      service.update(
        1,
        {
          content: 'Updated comment',
        },
        3,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should delete a comment when user is the author', async () => {
    jest.spyOn(prismaService.comment, 'findUnique').mockResolvedValue({
      id: 1,
      authorId: 2,
    });
    jest.spyOn(prismaService.comment, 'delete').mockResolvedValue({
      id: 1,
      content: 'Deleted comment',
      postId: 1,
      authorId: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(service.remove(1, 2)).resolves.toEqual({ id: 1 });
    expect(prismaService.comment.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
        authorId: true,
      },
    });
    expect(prismaService.comment.delete).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        postId: true,
      },
    });
  });

  it('should throw NotFoundException when deleting a missing comment', async () => {
    jest.spyOn(prismaService.comment, 'findUnique').mockResolvedValue(null);

    await expect(service.remove(999, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should throw ForbiddenException when deleting another user comment', async () => {
    jest.spyOn(prismaService.comment, 'findUnique').mockResolvedValue({
      id: 1,
      authorId: 2,
    });

    await expect(service.remove(1, 3)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
