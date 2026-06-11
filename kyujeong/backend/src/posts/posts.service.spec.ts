import { Test, TestingModule } from '@nestjs/testing';
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
              create: jest.fn(),
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
      },
    ];

    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue(posts);

    await expect(service.findAll(2, 5)).resolves.toBe(posts);
    expect(prismaService.post.findMany).toHaveBeenCalledWith({
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
      },
    });
  });

  it('should use minimum page and size when smaller values are given', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([]);

    await expect(service.findAll(0, 0)).resolves.toEqual([]);
    expect(prismaService.post.findMany).toHaveBeenCalledWith({
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
      },
    });
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
});
