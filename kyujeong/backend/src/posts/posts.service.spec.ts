import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from './posts.service';

describe('PostsService', () => {
  let service: PostsService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        {
          provide: PrismaService,
          useValue: {
            post: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return latest posts with pagination and list fields', async () => {
    const posts = [
      {
        id: 1,
        title: 'Test title',
        createdAt: new Date(),
        author: {
          nickname: 'tester',
        },
        postTags: [
          {
            tag: {
              name: 'nestjs',
            },
          },
        ],
      },
    ];

    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue(posts);

    await expect(service.findAll(2, 5)).resolves.toEqual([
      {
        id: posts[0].id,
        title: posts[0].title,
        createdAt: posts[0].createdAt,
        author: posts[0].author,
        tags: ['nestjs'],
      },
    ]);
    expect(prismaService.post.findMany).toHaveBeenCalledWith({
      where: undefined,
      skip: 5,
      take: 5,
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
        postTags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  });

  it('should use minimum page and size when smaller values are given', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([]);

    await expect(service.findAll(0, 0)).resolves.toEqual([]);
    expect(prismaService.post.findMany).toHaveBeenCalledWith({
      where: undefined,
      skip: 0,
      take: 1,
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
        postTags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  });

  it('should search posts by title', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([]);

    await expect(service.findAll(1, 10, 'test')).resolves.toEqual([]);
    expect(prismaService.post.findMany).toHaveBeenCalledWith({
      where: {
        title: {
          contains: 'test',
          mode: 'insensitive',
        },
      },
      skip: 0,
      take: 10,
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
        postTags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  });

  it('should increment view count and return a post detail', async () => {
    const post = {
      id: 1,
      title: 'Test title',
      content: 'Test content',
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: {
        nickname: 'tester',
      },
      postTags: [
        {
          tag: {
            name: 'nestjs',
          },
        },
      ],
    };

    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue(post);
    jest.spyOn(prismaService.post, 'update').mockResolvedValue({
      ...post,
      viewCount: 1,
    });

    await expect(service.findOne(1)).resolves.toEqual({
      id: post.id,
      title: post.title,
      content: post.content,
      viewCount: 1,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: post.author,
      tags: ['nestjs'],
    });
    expect(prismaService.post.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
        title: true,
        content: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            nickname: true,
          },
        },
        postTags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
    expect(prismaService.post.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        viewCount: {
          increment: 1,
        },
      },
      select: {
        id: true,
        title: true,
        content: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            nickname: true,
          },
        },
        postTags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  });

  it('should throw NotFoundException when post does not exist', async () => {
    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should create a post with the given author id', async () => {
    const createPostDto = {
      title: 'Test title',
      content: 'Test content',
    };

    const createdPost = {
      id: 1,
      ...createPostDto,
      authorId: 1,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    jest.spyOn(prismaService.post, 'create').mockResolvedValue(createdPost);

    await expect(service.create(createPostDto, 1)).resolves.toBe(createdPost);
    expect(prismaService.post.create).toHaveBeenCalledWith({
      data: {
        title: createPostDto.title,
        content: createPostDto.content,
        authorId: 1,
      },
    });
  });

  it('should create a post with tags', async () => {
    const createPostDto = {
      title: 'Test title',
      content: 'Test content',
      tagNames: [' nestjs ', 'prisma', 'nestjs'],
    };

    const createdPost = {
      id: 1,
      title: createPostDto.title,
      content: createPostDto.content,
      authorId: 1,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    jest.spyOn(prismaService.post, 'create').mockResolvedValue(createdPost);

    await expect(service.create(createPostDto, 1)).resolves.toBe(createdPost);
    expect(prismaService.post.create).toHaveBeenCalledWith({
      data: {
        title: createPostDto.title,
        content: createPostDto.content,
        authorId: 1,
        postTags: {
          create: [
            {
              tag: {
                connectOrCreate: {
                  where: {
                    name: 'nestjs',
                  },
                  create: {
                    name: 'nestjs',
                  },
                },
              },
            },
            {
              tag: {
                connectOrCreate: {
                  where: {
                    name: 'prisma',
                  },
                  create: {
                    name: 'prisma',
                  },
                },
              },
            },
          ],
        },
      },
    });
  });

  it('should throw BadRequestException when creating a post with more than 5 tags', async () => {
    await expect(
      service.create(
        {
          title: 'Test title',
          content: 'Test content',
          tagNames: ['one', 'two', 'three', 'four', 'five', 'six'],
        },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should update a post when the current user is the author', async () => {
    const updatePostDto = {
      title: 'Updated title',
      content: 'Updated content',
    };
    const updatedPost = {
      id: 1,
      ...updatePostDto,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: {
        nickname: 'tester',
      },
    };

    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue({
      id: 1,
      authorId: 1,
    });
    jest.spyOn(prismaService.post, 'update').mockResolvedValue(updatedPost);

    await expect(service.update(1, updatePostDto, 1)).resolves.toBe(
      updatedPost,
    );
    expect(prismaService.post.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
        authorId: true,
      },
    });
    expect(prismaService.post.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        title: updatePostDto.title,
        content: updatePostDto.content,
      },
      select: {
        id: true,
        title: true,
        content: true,
        viewCount: true,
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

  it('should throw NotFoundException when updating a missing post', async () => {
    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue(null);

    await expect(
      service.update(
        999,
        {
          title: 'Updated title',
          content: 'Updated content',
        },
        1,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should throw ForbiddenException when updating another user post', async () => {
    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue({
      id: 1,
      authorId: 2,
    });

    await expect(
      service.update(
        1,
        {
          title: 'Updated title',
          content: 'Updated content',
        },
        1,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should delete a post when the current user is the author', async () => {
    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue({
      id: 1,
      authorId: 1,
    });
    jest.spyOn(prismaService.post, 'delete').mockResolvedValue({
      id: 1,
      title: 'Deleted title',
      content: 'Deleted content',
      authorId: 1,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(service.remove(1, 1)).resolves.toEqual({ id: 1 });
    expect(prismaService.post.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
        authorId: true,
      },
    });
    expect(prismaService.post.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it('should throw NotFoundException when deleting a missing post', async () => {
    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue(null);

    await expect(service.remove(999, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should throw ForbiddenException when deleting another user post', async () => {
    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue({
      id: 1,
      authorId: 2,
    });

    await expect(service.remove(1, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
