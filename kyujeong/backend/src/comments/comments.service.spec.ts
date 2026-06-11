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

  it('should return comment creation data temporarily when post exists', async () => {
    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue({ id: 1 });

    await expect(
      service.create(
        1,
        {
          content: 'Test comment',
        },
        2,
      ),
    ).resolves.toEqual({
      postId: 1,
      content: 'Test comment',
      authorId: 2,
    });
    expect(prismaService.post.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
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
