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

  it('should return an empty post list temporarily', () => {
    expect(service.findAll()).toEqual([]);
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
