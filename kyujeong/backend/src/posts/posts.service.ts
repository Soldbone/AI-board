import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll(page: number, size: number, search?: string, tag?: string) {
    const currentPage = Math.max(page, 1);
    const pageSize = Math.max(size, 1);
    const keyword = search?.trim();
    const tagName = tag?.trim();
    const where: Prisma.PostWhereInput | undefined =
      keyword || tagName
        ? {
            ...(keyword
              ? {
                  title: {
                    contains: keyword,
                    mode: 'insensitive',
                  },
                }
              : {}),
            ...(tagName
              ? {
                  postTags: {
                    some: {
                      tag: {
                        name: tagName,
                      },
                    },
                  },
                }
              : {}),
          }
        : undefined;

    const [posts, total] = await Promise.all([
      this.prismaService.post.findMany({
        where,
        skip: (currentPage - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          createdAt: true,
          author: {
            select: {
              id: true,
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
          _count: {
            select: {
              comments: true,
            },
          },
          aiRecommendations: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
            select: {
              id: true,
              status: true,
            },
          },
        },
      }),
      this.prismaService.post.count({ where }),
    ]);

    return {
      items: posts.map((post) => this.mapPostTagsToTags(post)),
      total,
      page: currentPage,
      size: pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: number) {
    const post = await this.prismaService.post.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
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

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const updatedPost = await this.prismaService.post.update({
      where: { id },
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
            id: true,
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

    return this.mapPostTagsToTags(updatedPost);
  }

  async create(createPostDto: CreatePostDto, authorId: number) {
    const tagNames = this.normalizeTagNames(createPostDto.tagNames);

    return this.prismaService.post.create({
      data: {
        title: createPostDto.title,
        content: createPostDto.content,
        authorId,
        ...(tagNames.length > 0
          ? {
              postTags: {
                create: tagNames.map((tagName) => ({
                  tag: {
                    connectOrCreate: {
                      where: {
                        name: tagName,
                      },
                      create: {
                        name: tagName,
                      },
                    },
                  },
                })),
              },
            }
          : {}),
      },
    });
  }

  async update(id: number, updatePostDto: UpdatePostDto, userId: number) {
    const shouldUpdateTags = Array.isArray(updatePostDto.tagNames);
    const tagNames = shouldUpdateTags
      ? this.normalizeTagNames(updatePostDto.tagNames)
      : [];

    const post = await this.prismaService.post.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only update your own post');
    }

    const updatedPost = await this.prismaService.post.update({
      where: { id },
      data: {
        title: updatePostDto.title,
        content: updatePostDto.content,
        ...(shouldUpdateTags
          ? {
              postTags: {
                deleteMany: {},
                ...(tagNames.length > 0
                  ? {
                      create: tagNames.map((tagName) => ({
                        tag: {
                          connectOrCreate: {
                            where: {
                              name: tagName,
                            },
                            create: {
                              name: tagName,
                            },
                          },
                        },
                      })),
                    }
                  : {}),
              },
            }
          : {}),
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
            id: true,
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

    await this.markAiRecommendationStale(id);

    return this.mapPostTagsToTags(updatedPost);
  }

  async remove(id: number, userId: number) {
    const post = await this.prismaService.post.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own post');
    }

    await this.prismaService.post.delete({
      where: { id },
    });

    return { id };
  }

  private normalizeTagNames(tagNames?: string[]) {
    const normalizedTagNames = [
      ...new Set((tagNames ?? []).map((tagName) => tagName.trim())),
    ].filter(Boolean);

    if (normalizedTagNames.length > 5) {
      throw new BadRequestException('Tags can be up to 5');
    }

    if (normalizedTagNames.some((tagName) => tagName.length > 20)) {
      throw new BadRequestException('Tag name can be up to 20 characters');
    }

    return normalizedTagNames;
  }

  private async markAiRecommendationStale(postId: number) {
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

  private mapPostTagsToTags<
    T extends {
      postTags: {
        tag: {
          name: string;
        };
      }[];
      _count?: {
        comments: number;
      };
      aiRecommendations?: {
        id: number;
        status: 'ACTIVE' | 'STALE';
      }[];
    },
  >(post: T) {
    const { postTags, _count, aiRecommendations, ...postWithoutPostTags } =
      post;

    return {
      ...postWithoutPostTags,
      tags: postTags.map((postTag) => postTag.tag.name),
      commentsCount: _count?.comments ?? 0,
      ...(aiRecommendations
        ? {
            hasAiRecommendation: aiRecommendations.length > 0,
            aiRecommendationStatus: aiRecommendations[0]?.status ?? null,
          }
        : {}),
    };
  }
}
