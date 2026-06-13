import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmbeddingService,
  RAG_EMBEDDING_DIMENSION,
} from './embedding.service';
import { CreateDirectRecommendationDto } from './dto/create-direct-recommendation.dto';
import {
  RecipeLlmService,
  type RecommendationGrounding,
} from './recipe-llm.service';

const ragPostSelect = {
  id: true,
  title: true,
  content: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
  postTags: {
    select: {
      tag: {
        select: {
          name: true,
        },
      },
    },
  },
  comments: {
    orderBy: {
      createdAt: 'asc',
    },
    take: 3,
    select: {
      content: true,
    },
  },
  _count: {
    select: {
      comments: true,
    },
  },
} satisfies Prisma.PostSelect;

type RagPost = Prisma.PostGetPayload<{
  select: typeof ragPostSelect;
}>;

type SimilarPost = {
  postId: number;
  title: string;
  summary: string;
  tags: string[];
  similarity: number;
};

@Injectable()
export class AiRecommendationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly recipeLlmService: RecipeLlmService,
  ) {}

  async getStatus() {
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
    const pgvectorStatus = await this.getPgvectorStatus();

    return {
      mode: hasOpenAiKey ? 'OPENAI' : 'FALLBACK',
      openAiConfigured: hasOpenAiKey,
      embeddingModel: hasOpenAiKey
        ? (process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small')
        : 'local-hash-v1',
      chatModel: hasOpenAiKey
        ? (process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini')
        : null,
      dailyLimit: null,
      pgvectorAvailable: pgvectorStatus.available,
      pgvectorInstalled: pgvectorStatus.installed,
      pgvectorDecision: pgvectorStatus.installed
        ? 'pgvector is installed; vector search is the primary retrieval path.'
        : pgvectorStatus.available
          ? 'pgvector is available; run the Prisma migration to install the vector extension for this database.'
          : 'Current database image does not expose the vector extension; switch to a pgvector-enabled PostgreSQL image.',
    };
  }

  async findLatest(postId: number) {
    await this.assertPostExists(postId);

    const recommendation =
      await this.prismaService.aiRecipeRecommendation.findFirst({
        where: { postId },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
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

    return recommendation ? this.mapRecommendation(recommendation) : null;
  }

  async create(postId: number, requesterId: number) {
    const targetPost = await this.findRagPost(postId);
    const targetDocument = this.buildRagDocument(targetPost);
    const targetEmbeddingResult = await this.embeddingService.embed(targetDocument);

    await this.upsertRagDocument(
      targetPost.id,
      targetDocument,
      targetEmbeddingResult.embedding,
      targetEmbeddingResult.model,
    );

    const candidatePosts = await this.prismaService.post.findMany({
      where: {
        id: {
          not: postId,
        },
      },
      take: 50,
      orderBy: {
        createdAt: 'desc',
      },
      select: ragPostSelect,
    });
    const similarPosts = await this.findSimilarPosts(
      targetEmbeddingResult.embedding,
      candidatePosts,
    );
    const grounding = this.getRecommendationGrounding(similarPosts);
    const recommendationDraft =
      await this.recipeLlmService.createRecommendation(
        this.toRecipeContext(targetPost),
        similarPosts.map((similarPost) => ({
          title: similarPost.title,
          summary: similarPost.summary,
          tags: similarPost.tags,
          similarity: similarPost.similarity,
        })),
        grounding,
      );

    const recommendation =
      await this.prismaService.aiRecipeRecommendation.create({
        data: {
          postId,
          requestedById: requesterId,
          menuName: recommendationDraft.menuName,
          reason: recommendationDraft.reason,
          availableIngredients: recommendationDraft.availableIngredients,
          missingIngredients: recommendationDraft.missingIngredients,
          estimatedCookingTime: recommendationDraft.estimatedCookingTime,
          difficulty: recommendationDraft.difficulty,
          content: recommendationDraft.content,
          grounding,
          references: {
            create: similarPosts.map((similarPost, index) => ({
              postId: similarPost.postId,
              similarity: similarPost.similarity,
              rank: index + 1,
            })),
          },
        },
        include: {
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

    return this.mapRecommendation(recommendation);
  }

  async createDirect(
    createDirectRecommendationDto: CreateDirectRecommendationDto,
    requesterId: number,
  ) {
    const ingredients = this.normalizeIngredients(
      createDirectRecommendationDto.ingredients,
    );
    const conditions = createDirectRecommendationDto.conditions?.trim() ?? '';
    const targetDocument = this.buildDirectRagDocument(ingredients, conditions);
    const targetEmbeddingResult = await this.embeddingService.embed(targetDocument);
    const candidatePosts = await this.prismaService.post.findMany({
      take: 50,
      orderBy: {
        createdAt: 'desc',
      },
      select: ragPostSelect,
    });
    const similarPosts = await this.findSimilarPosts(
      targetEmbeddingResult.embedding,
      candidatePosts,
    );
    const grounding = this.getRecommendationGrounding(similarPosts);
    const recommendationDraft =
      await this.recipeLlmService.createRecommendation(
        {
          title: '직접 입력 냉파 추천',
          content: [
            `보유 재료: ${ingredients.join(', ')}`,
            conditions ? `조건: ${conditions}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          tags: ingredients.slice(0, 5),
        },
        similarPosts.map((similarPost) => ({
          title: similarPost.title,
          summary: similarPost.summary,
          tags: similarPost.tags,
          similarity: similarPost.similarity,
        })),
        grounding,
      );

    const recommendation =
      await this.prismaService.aiRecipeRecommendation.create({
        data: {
          postId: null,
          requestedById: requesterId,
          menuName: recommendationDraft.menuName,
          reason: recommendationDraft.reason,
          availableIngredients: recommendationDraft.availableIngredients,
          missingIngredients: recommendationDraft.missingIngredients,
          estimatedCookingTime: recommendationDraft.estimatedCookingTime,
          difficulty: recommendationDraft.difficulty,
          content: recommendationDraft.content,
          grounding,
          references: {
            create: similarPosts.map((similarPost, index) => ({
              postId: similarPost.postId,
              similarity: similarPost.similarity,
              rank: index + 1,
            })),
          },
        },
        include: {
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

    return this.mapRecommendation(recommendation);
  }

  private async assertPostExists(postId: number) {
    const post = await this.prismaService.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }
  }

  private async findRagPost(postId: number) {
    const post = await this.prismaService.post.findUnique({
      where: { id: postId },
      select: ragPostSelect,
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  private async findSimilarPosts(
    targetEmbedding: number[],
    candidatePosts: RagPost[],
  ): Promise<SimilarPost[]> {
    if (candidatePosts.length === 0) {
      return [];
    }

    try {
      await Promise.all(
        candidatePosts.map(async (post) => {
          const documentText = this.buildRagDocument(post);
          const embeddingResult = await this.embeddingService.embed(documentText);

          await this.upsertRagDocument(
            post.id,
            documentText,
            embeddingResult.embedding,
            embeddingResult.model,
          );
        }),
      );

      return await this.findSimilarPostsWithPgvector(
        targetEmbedding,
        candidatePosts,
      );
    } catch {
      return this.findSimilarPostsInMemory(targetEmbedding, candidatePosts);
    }
  }

  private getRecommendationGrounding(
    similarPosts: SimilarPost[],
  ): RecommendationGrounding {
    return similarPosts.length > 0 ? 'COMMUNITY_RAG' : 'GENERAL_AI';
  }

  private async upsertRagDocument(
    postId: number,
    documentText: string,
    embedding: number[],
    embeddingModel: string,
  ) {
    const vectorLiteral = this.toVectorLiteral(embedding);

    try {
      await this.prismaService.$executeRaw`
        INSERT INTO "PostRagDocument"
          ("postId", "documentText", "embedding", "embeddingModel", "embeddedAt", "isStale", "createdAt", "updatedAt")
        VALUES
          (${postId}, ${documentText}, ${vectorLiteral}::vector, ${embeddingModel}, NOW(), false, NOW(), NOW())
        ON CONFLICT ("postId") DO UPDATE SET
          "documentText" = EXCLUDED."documentText",
          "embedding" = EXCLUDED."embedding",
          "embeddingModel" = EXCLUDED."embeddingModel",
          "embeddedAt" = NOW(),
          "isStale" = false,
          "updatedAt" = NOW()
      `;
    } catch {
      return false;
    }

    return true;
  }

  private async findSimilarPostsWithPgvector(
    targetEmbedding: number[],
    candidatePosts: RagPost[],
  ) {
    const candidatePostIds = candidatePosts.map((post) => post.id);
    const targetVector = this.toVectorLiteral(targetEmbedding);
    const rows = await this.prismaService.$queryRaw<
      Array<{ postId: number; similarity: number }>
    >`
      SELECT
        "postId",
        1 - ("embedding" <=> ${targetVector}::vector) AS "similarity"
      FROM "PostRagDocument"
      WHERE "postId" IN (${Prisma.join(candidatePostIds)})
        AND "isStale" = false
      ORDER BY "embedding" <=> ${targetVector}::vector
      LIMIT 5
    `;
    const postsById = new Map(candidatePosts.map((post) => [post.id, post]));

    return rows
      .map((row) => {
        const post = postsById.get(row.postId);

        if (!post) {
          return null;
        }

        return {
          postId: post.id,
          title: post.title,
          summary: this.summarizePost(post),
          tags: this.getTags(post),
          similarity: Number(row.similarity),
        };
      })
      .filter((post): post is SimilarPost => Boolean(post))
      .filter((post) => post.similarity > 0);
  }

  private async findSimilarPostsInMemory(
    targetEmbedding: number[],
    candidatePosts: RagPost[],
  ) {
    const scoredPosts = await Promise.all(
      candidatePosts.map(async (post) => {
        const documentText = this.buildRagDocument(post);
        const embeddingResult = await this.embeddingService.embed(documentText);

        return {
          postId: post.id,
          title: post.title,
          summary: this.summarizePost(post),
          tags: this.getTags(post),
          similarity: this.embeddingService.cosineSimilarity(
            targetEmbedding,
            embeddingResult.embedding,
          ),
        };
      }),
    );

    return scoredPosts
      .filter((post) => post.similarity > 0)
      .sort((firstPost, secondPost) => secondPost.similarity - firstPost.similarity)
      .slice(0, 5);
  }

  private async getPgvectorStatus() {
    try {
      const [status] = await this.prismaService.$queryRaw<
        Array<{ available: boolean; installed: boolean }>
      >`
        SELECT
          EXISTS (
            SELECT 1 FROM pg_available_extensions WHERE name = 'vector'
          ) AS "available",
          EXISTS (
            SELECT 1 FROM pg_extension WHERE extname = 'vector'
          ) AS "installed"
      `;

      return {
        available: Boolean(status?.available),
        installed: Boolean(status?.installed),
      };
    } catch {
      return {
        available: false,
        installed: false,
      };
    }
  }

  private toVectorLiteral(embedding: number[]) {
    const normalizedEmbedding = this.normalizeEmbeddingDimension(embedding);

    return `[${normalizedEmbedding
      .map((value) => (Number.isFinite(value) ? value.toFixed(8) : '0'))
      .join(',')}]`;
  }

  private normalizeEmbeddingDimension(embedding: number[]) {
    if (embedding.length === RAG_EMBEDDING_DIMENSION) {
      return embedding;
    }

    if (embedding.length > RAG_EMBEDDING_DIMENSION) {
      return embedding.slice(0, RAG_EMBEDDING_DIMENSION);
    }

    return [
      ...embedding,
      ...Array.from(
        { length: RAG_EMBEDDING_DIMENSION - embedding.length },
        () => 0,
      ),
    ];
  }

  private buildRagDocument(post: RagPost) {
    const tags = this.getTags(post);
    const commentSummary = post.comments.length
      ? post.comments
          .map((comment) => `- ${comment.content}`)
          .join('\n')
      : '- 아직 댓글이 없습니다.';

    return [
      '[게시글 ID]',
      `postId: ${post.id}`,
      '',
      '[제목]',
      post.title,
      '',
      '[본문]',
      post.content,
      '',
      '[태그]',
      tags.length ? tags.join(', ') : '태그 없음',
      '',
      '[댓글 요약]',
      commentSummary,
      '',
      '[게시글 반응]',
      `댓글 수: ${post._count.comments}`,
      `조회 수: ${post.viewCount}`,
    ].join('\n');
  }

  private buildDirectRagDocument(ingredients: string[], conditions: string) {
    return [
      '[직접 입력 추천 요청]',
      '',
      '[보유 재료]',
      ingredients.join(', '),
      '',
      '[조건]',
      conditions || '조건 없음',
    ].join('\n');
  }

  private normalizeIngredients(ingredients: string[]) {
    return [...new Set(ingredients.map((ingredient) => ingredient.trim()))]
      .filter(Boolean)
      .slice(0, 12);
  }

  private toRecipeContext(post: RagPost) {
    return {
      title: post.title,
      content: post.content,
      tags: this.getTags(post),
    };
  }

  private summarizePost(post: RagPost) {
    const content = post.content.replace(/\s+/g, ' ').trim();

    return content.length > 120 ? `${content.slice(0, 120)}...` : content;
  }

  private getTags(post: Pick<RagPost, 'postTags'>) {
    return post.postTags.map((postTag) => postTag.tag.name);
  }

  private mapRecommendation(
    recommendation: Prisma.AiRecipeRecommendationGetPayload<{
      include: {
        references: {
          include: {
            post: {
              select: {
                id: true;
                title: true;
                postTags: {
                  select: {
                    tag: {
                      select: {
                        name: true;
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    }>,
  ) {
    return {
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
      referencedPosts: recommendation.references.map((reference) => ({
        postId: reference.postId,
        title: reference.post.title,
        tags: reference.post.postTags.map((postTag) => postTag.tag.name),
        similarity: Number(reference.similarity.toFixed(4)),
        rank: reference.rank,
      })),
    };
  }
}
