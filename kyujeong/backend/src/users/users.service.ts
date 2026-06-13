import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async findMe(userId: number) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findMyPosts(userId: number) {
    const posts = await this.prismaService.post.findMany({
      where: {
        authorId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
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
    });

    return posts.map(({ postTags, _count, aiRecommendations, ...post }) => ({
      ...post,
      tags: postTags.map((postTag) => postTag.tag.name),
      commentsCount: _count.comments,
      hasAiRecommendation: aiRecommendations.length > 0,
      aiRecommendationStatus: aiRecommendations[0]?.status ?? null,
    }));
  }

  async findMyComments(userId: number) {
    return this.prismaService.comment.findMany({
      where: {
        authorId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        content: true,
        postId: true,
        createdAt: true,
        updatedAt: true,
        post: {
          select: {
            id: true,
            title: true,
          },
        },
        author: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });
  }

  async findMyAiRecommendations(userId: number) {
    const recommendations =
      await this.prismaService.aiRecipeRecommendation.findMany({
        where: {
          requestedById: userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50,
        include: {
          post: {
            select: {
              id: true,
              title: true,
            },
          },
          references: {
            orderBy: {
              rank: 'asc',
            },
            include: {
              post: {
                select: {
                  id: true,
                  title: true,
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
              },
            },
          },
        },
      });

    return recommendations.map((recommendation) => ({
      id: recommendation.id,
      postId: recommendation.postId,
      menuName: recommendation.menuName,
      reason: recommendation.reason,
      availableIngredients: recommendation.availableIngredients,
      missingIngredients: recommendation.missingIngredients,
      estimatedCookingTime: recommendation.estimatedCookingTime,
      difficulty: recommendation.difficulty,
      content: recommendation.content,
      status: recommendation.status,
      grounding: recommendation.grounding,
      createdAt: recommendation.createdAt,
      post: recommendation.post,
      referencedPosts: recommendation.references.map((reference) => ({
        postId: reference.postId,
        title: reference.post.title,
        tags: reference.post.postTags.map((postTag) => postTag.tag.name),
        similarity: Number(reference.similarity.toFixed(4)),
        rank: reference.rank,
      })),
    }));
  }
}
