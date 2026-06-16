import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FoodMetadataService } from '../food-metadata/food-metadata.service';
import type { IngredientSetAnalysis } from '../food-metadata/food-metadata.types';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService, RAG_EMBEDDING_DIMENSION } from './embedding.service';
import { CreateDirectRecommendationDto } from './dto/create-direct-recommendation.dto';
import { CreateRecommendationDto } from './dto/create-recommendation.dto';
import {
  RecipeLlmService,
  type RecommendationGrounding,
  type RecipeRecommendationDraft,
} from './recipe-llm.service';
import {
  AI_RECOMMENDATION_GOAL_LABELS,
  normalizeAiRecommendationGoal,
} from './recommendation-goal';
import { RecipeImageService } from './recipe-image.service';

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
  questionSummary: string;
  commentEvidence: string[];
  tags: string[];
  similarity: number;
  semanticSimilarity: number;
  ingredients: string[];
  matchedIngredients: string[];
  missingIngredients: string[];
};

const DEFAULT_RAG_MIN_SIMILARITY = 0.55;
const DEFAULT_RAG_MIN_INGREDIENT_OVERLAP = 1;
const MAX_REFERENCE_POSTS = 5;
const MAX_VECTOR_CANDIDATES = 25;
const KNOWN_INGREDIENTS = [
  '아보카도',
  '병아리콩',
  '그릭요거트',
  '요거트',
  '레몬즙',
  '레몬',
  '퀴노아',
  '할루미',
  '방울토마토',
  '토마토',
  '오이',
  '올리브오일',
  '브로콜리',
  '두부',
  '순두부',
  '계란',
  '달걀',
  '김치',
  '밥',
  '면',
  '파스타',
  '참기름',
  '들기름',
  '마늘',
  '양파',
  '대파',
  '쪽파',
  '부추',
  '고추장',
  '청양고추',
  '고추',
  '간장',
  '소금',
  '후추',
  '굴소스',
  '카레가루',
  '카레',
  '치즈',
  '우유',
  '버터',
  '감자',
  '고구마',
  '당근',
  '무',
  '배추',
  '애호박',
  '가지',
  '버섯',
  '팽이버섯',
  '표고버섯',
  '느타리버섯',
  '새송이버섯',
  '양배추',
  '상추',
  '깻잎',
  '시금치',
  '콩나물',
  '숙주',
  '닭고기',
  '닭다리살',
  '닭안심',
  '돼지고기',
  '삼겹살',
  '목살',
  '소고기',
  '고기',
  '참치',
  '고추참치',
  '연어',
  '고등어',
  '꽁치',
  '새우',
  '오징어',
  '햄',
  '스팸',
  '소시지',
  '베이컨',
  '어묵',
  '맛살',
  '만두',
  '떡',
  '김',
  '김가루',
  '미역',
  '된장',
  '고춧가루',
  '마요네즈',
  '식용유',
  '식초',
  '설탕',
  '꿀',
  '견과류',
  '아몬드',
  '호두',
  '사과',
  '바나나',
  '라면',
  '소면',
  '우동면',
];
const INGREDIENT_ALIASES = new Map([
  ['달걀', '계란'],
  ['레몬즙', '레몬'],
  ['스팸', '햄'],
  ['고추참치', '참치'],
]);
const NON_INGREDIENT_TERMS = new Set([
  '추천',
  '해주세요',
  '부탁드려요',
  '있어요',
  '있습니다',
  '냉장고',
  '요리',
  '메뉴',
  '저녁',
  '점심',
  '아침',
  '간단',
  '간단한',
  '간단하게',
  '재료',
  '보유',
  '남은',
  '활용',
  '방법',
  '만들기',
  '만들',
  '볶음',
  '볶음밥',
  '주먹밥',
  '샐러드',
  '찌개',
  '국',
  '반찬',
  '먹는',
  '먹고',
  '먹을',
  '먹기',
  '무엇',
  '무슨',
  '후기',
  '조합',
  '추가',
  '더하면',
  '더해',
  '더해서',
  '싶어요',
  '좋아요',
  '느낌',
  '조건',
  '없음',
  '집',
  '집에',
  '냉장고에',
  '가지고',
  '갖고',
  '있는',
  '있는데',
  '있고',
  '있어서',
  '남았는데',
  '남았어요',
  '남았습니다',
  '추천해주세요',
  '부탁드립니다',
  '괜찮을까요',
  '퇴근',
  '출근',
  '오늘',
  '내일',
  '어제',
  '주말',
  '평일',
  '바로',
  '빨리',
  '빠르게',
  '빠른',
  '안에',
  '이내',
  '동안',
  '이후',
  '이전',
  '가능',
  '가능한',
  '가능하게',
]);

@Injectable()
export class AiRecommendationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly recipeLlmService: RecipeLlmService,
    private readonly recipeImageService: RecipeImageService,
    private readonly foodMetadataService: FoodMetadataService,
  ) {}

  async getStatus() {
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
    const pgvectorStatus = await this.getPgvectorStatus();
    const imageGenerationStatus = this.recipeImageService.getStatus();

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
      ragMinSimilarity: this.getRagMinSimilarity(),
      ragMinIngredientOverlap: this.getRagMinIngredientOverlap(),
      imageGenerationConfigured: imageGenerationStatus.configured,
      imageGenerationEnabled: imageGenerationStatus.enabled,
      imageModel: imageGenerationStatus.model,
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

  async create(
    postId: number,
    requesterId: number,
    createRecommendationDto: CreateRecommendationDto = {},
  ) {
    const targetPost = await this.findRagPost(postId);
    const targetDocument = this.buildRagDocument(targetPost);
    const targetIngredients = this.extractIngredientsFromRagPost(targetPost);
    const nutritionGoal = normalizeAiRecommendationGoal(
      createRecommendationDto.nutritionGoal,
    );
    const additionalRequest =
      createRecommendationDto.additionalRequest?.trim() ?? '';
    const targetEmbeddingResult =
      await this.embeddingService.embed(targetDocument);

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
      targetIngredients,
    );
    const grounding = this.getRecommendationGrounding(similarPosts);
    const nutritionMetadata =
      await this.getIngredientNutritionMetadata(targetIngredients);
    const rawRecommendationDraft =
      await this.recipeLlmService.createRecommendation(
        this.toRecipeContext(targetPost, targetIngredients, additionalRequest),
        similarPosts.map((similarPost) => ({
          title: similarPost.title,
          summary: similarPost.summary,
          questionSummary: similarPost.questionSummary,
          commentEvidence: similarPost.commentEvidence,
          tags: similarPost.tags,
          similarity: similarPost.similarity,
          semanticSimilarity: similarPost.semanticSimilarity,
          ingredients: similarPost.ingredients,
          matchedIngredients: similarPost.matchedIngredients,
          missingIngredients: similarPost.missingIngredients,
        })),
        grounding,
        nutritionMetadata,
        nutritionGoal,
      );
    const recommendationDraft = this.completeRecommendationDraft(
      rawRecommendationDraft,
      targetIngredients,
    );
    const thumbnailUrl = await this.createRecommendationThumbnailUrl(
      recommendationDraft.menuName,
      recommendationDraft.availableIngredients,
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
          thumbnailUrl,
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
    const targetIngredients = this.normalizeIngredientTerms(ingredients);
    const nutritionGoal = normalizeAiRecommendationGoal(
      createDirectRecommendationDto.nutritionGoal,
    );
    const targetDocument = this.buildDirectRagDocument(ingredients, conditions);
    const targetEmbeddingResult =
      await this.embeddingService.embed(targetDocument);
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
      targetIngredients,
    );
    const grounding = this.getRecommendationGrounding(similarPosts);
    const nutritionMetadata =
      await this.getIngredientNutritionMetadata(targetIngredients);
    const rawRecommendationDraft =
      await this.recipeLlmService.createRecommendation(
        {
          title: '직접 입력 냉파 추천',
          content: [
            `보유 재료: ${ingredients.join(', ')}`,
            conditions ? `조건: ${conditions}` : '',
            `추천 목표: ${AI_RECOMMENDATION_GOAL_LABELS[nutritionGoal]}`,
          ]
            .filter(Boolean)
            .join('\n'),
          tags: ingredients.slice(0, 5),
          availableIngredients: targetIngredients,
        },
        similarPosts.map((similarPost) => ({
          title: similarPost.title,
          summary: similarPost.summary,
          questionSummary: similarPost.questionSummary,
          commentEvidence: similarPost.commentEvidence,
          tags: similarPost.tags,
          similarity: similarPost.similarity,
          semanticSimilarity: similarPost.semanticSimilarity,
          ingredients: similarPost.ingredients,
          matchedIngredients: similarPost.matchedIngredients,
          missingIngredients: similarPost.missingIngredients,
        })),
        grounding,
        nutritionMetadata,
        nutritionGoal,
      );
    const recommendationDraft = this.completeRecommendationDraft(
      rawRecommendationDraft,
      targetIngredients,
    );
    const thumbnailUrl = await this.createRecommendationThumbnailUrl(
      recommendationDraft.menuName,
      recommendationDraft.availableIngredients,
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
          thumbnailUrl,
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

  private async getIngredientNutritionMetadata(ingredients: string[]) {
    if (ingredients.length === 0) {
      return null;
    }

    try {
      const metadata =
        await this.foodMetadataService.analyzeIngredientsNutrition(
          ingredients.slice(0, 8),
        );

      return this.hasUsableNutritionMetadata(metadata) ? metadata : null;
    } catch {
      return null;
    }
  }

  private hasUsableNutritionMetadata(metadata: IngredientSetAnalysis) {
    return metadata.ingredients.some((ingredient) =>
      Object.values(ingredient.nutrition).some(
        (value) => typeof value === 'number',
      ),
    );
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
    targetIngredients: string[],
  ): Promise<SimilarPost[]> {
    if (candidatePosts.length === 0) {
      return [];
    }

    try {
      await Promise.all(
        candidatePosts.map(async (post) => {
          const documentText = this.buildRagDocument(post);
          const embeddingResult =
            await this.embeddingService.embed(documentText);

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
        targetIngredients,
      );
    } catch {
      return this.findSimilarPostsInMemory(
        targetEmbedding,
        candidatePosts,
        targetIngredients,
      );
    }
  }

  private getRecommendationGrounding(
    similarPosts: SimilarPost[],
  ): RecommendationGrounding {
    return similarPosts.length > 0 ? 'COMMUNITY_RAG' : 'GENERAL_AI';
  }

  private completeRecommendationDraft(
    recommendationDraft: RecipeRecommendationDraft,
    targetIngredients: string[],
  ): RecipeRecommendationDraft {
    const targetIngredientSet = new Set(
      targetIngredients.flatMap((ingredient) =>
        this.getIngredientComparisonTokens(ingredient),
      ),
    );
    const recipeText = [
      recommendationDraft.menuName,
      recommendationDraft.reason,
      recommendationDraft.content,
    ]
      .join(' ')
      .toLowerCase();
    const draftUsedIngredients = recommendationDraft.usedIngredients ?? [];
    const usedIngredients = this.normalizeRecipeIngredientEntries(
      draftUsedIngredients.length
        ? draftUsedIngredients
        : this.extractIngredientTerms(recipeText),
    ).filter((ingredient) =>
      this.isIngredientUsedInRecipeText(ingredient, recipeText),
    );
    const missingIngredients = usedIngredients.filter((ingredient) =>
      this
        .getIngredientComparisonTokens(ingredient)
        .every((token) => !targetIngredientSet.has(token)),
    );

    return {
      ...recommendationDraft,
      usedIngredients,
      missingIngredients: [...new Set(missingIngredients)].slice(0, 4),
    };
  }

  private normalizeRecipeIngredientEntries(ingredients: string[]) {
    return [
      ...new Set(
        ingredients
          .flatMap((ingredient) =>
            ingredient
              .toLowerCase()
              .replace(/[^\p{L}\p{N},/·\s]/gu, ' ')
          .split(/\s*(?:,|\/|·|또는|혹은|및)\s*/gu),
          )
          .map((ingredient) => this.normalizeIngredientToken(ingredient))
          .filter((ingredient) => this.isRecipeIngredientEntryToken(ingredient))
          .map((ingredient) => this.normalizeIngredientAlias(ingredient)),
      ),
    ].slice(0, 12);
  }

  private getIngredientComparisonTokens(ingredient: string) {
    return [
      ...new Set(
        [
          ...this.normalizeRecipeIngredientEntries([ingredient]),
          ...this.extractIngredientTerms(ingredient),
          this.normalizeIngredientToken(ingredient),
        ]
          .filter((token) => this.isRecipeIngredientEntryToken(token))
          .map((token) => this.normalizeIngredientAlias(token)),
      ),
    ];
  }

  private isRecipeIngredientEntryToken(token: string) {
    return (
      this.isKnownIngredientToken(token) ||
      this.isPotentialDirectIngredientToken(token)
    );
  }

  private isIngredientUsedInRecipeText(ingredient: string, recipeText: string) {
    const recipeIngredientMentions = new Set(this.extractIngredientTerms(recipeText));

    return this.getIngredientComparisonTokens(ingredient).some((token) => {
      if (token.length < 2) {
        return recipeIngredientMentions.has(token);
      }

      return recipeIngredientMentions.has(token) || recipeText.includes(token);
    });
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
    targetIngredients: string[],
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
      LIMIT ${MAX_VECTOR_CANDIDATES}
    `;
    const postsById = new Map(candidatePosts.map((post) => [post.id, post]));

    return rows
      .map((row) => {
        const post = postsById.get(row.postId);

        if (!post) {
          return null;
        }

        return this.buildSimilarPost(
          post,
          Number(row.similarity),
          targetIngredients,
        );
      })
      .filter((post): post is SimilarPost => Boolean(post))
      .filter((post) => this.isStrongSimilarPost(post, targetIngredients))
      .slice(0, MAX_REFERENCE_POSTS);
  }

  private async findSimilarPostsInMemory(
    targetEmbedding: number[],
    candidatePosts: RagPost[],
    targetIngredients: string[],
  ) {
    const scoredPosts = await Promise.all(
      candidatePosts.map(async (post) => {
        const documentText = this.buildRagDocument(post);
        const embeddingResult = await this.embeddingService.embed(documentText);
        const similarity = this.embeddingService.cosineSimilarity(
          targetEmbedding,
          embeddingResult.embedding,
        );

        return this.buildSimilarPost(post, similarity, targetIngredients);
      }),
    );

    return scoredPosts
      .filter((post) => this.isStrongSimilarPost(post, targetIngredients))
      .sort(
        (firstPost, secondPost) => secondPost.similarity - firstPost.similarity,
      )
      .slice(0, MAX_REFERENCE_POSTS);
  }

  private buildSimilarPost(
    post: RagPost,
    semanticSimilarity: number,
    targetIngredients: string[],
  ): SimilarPost {
    const ingredients = this.extractIngredientsFromRagPost(post);
    const matchedIngredients = ingredients.filter((ingredient) =>
      targetIngredients.includes(ingredient),
    );

    return {
      postId: post.id,
      title: post.title,
      summary: this.summarizeEvidence(post),
      questionSummary: this.summarizePost(post),
      commentEvidence: this.getCommentEvidence(post),
      tags: this.getTags(post),
      similarity: semanticSimilarity,
      semanticSimilarity,
      ingredients,
      matchedIngredients,
      missingIngredients: ingredients.filter(
        (ingredient) => !targetIngredients.includes(ingredient),
      ),
    };
  }

  private isStrongSimilarPost(post: SimilarPost, targetIngredients: string[]) {
    if (post.semanticSimilarity < this.getRagMinSimilarity()) {
      return false;
    }

    if (post.commentEvidence.length === 0) {
      return false;
    }

    if (targetIngredients.length === 0) {
      return true;
    }

    return post.matchedIngredients.length >= this.getRagMinIngredientOverlap();
  }

  private getRagMinSimilarity() {
    const configuredSimilarity = Number(
      process.env.AI_RECOMMENDATION_MIN_SIMILARITY,
    );

    if (Number.isFinite(configuredSimilarity)) {
      return Math.min(Math.max(configuredSimilarity, 0), 1);
    }

    return DEFAULT_RAG_MIN_SIMILARITY;
  }

  private getRagMinIngredientOverlap() {
    const configuredOverlap = Number(
      process.env.AI_RECOMMENDATION_MIN_INGREDIENT_OVERLAP,
    );

    if (Number.isFinite(configuredOverlap)) {
      return Math.max(Math.floor(configuredOverlap), 0);
    }

    return DEFAULT_RAG_MIN_INGREDIENT_OVERLAP;
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
      ? post.comments.map((comment) => `- ${comment.content}`).join('\n')
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

  private toRecipeContext(
    post: RagPost,
    availableIngredients: string[],
    additionalRequest = '',
  ) {
    return {
      title: post.title,
      content: [
        post.content,
        additionalRequest ? `[추가 요청]\n${additionalRequest}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      tags: this.getTags(post),
      availableIngredients,
    };
  }

  private extractIngredientsFromRagPost(post: RagPost) {
    return this.extractIngredientTerms(
      [post.title, post.content, ...this.getTags(post)].join(' '),
    );
  }

  private normalizeIngredientTerms(ingredients: string[]) {
    return [
      ...new Set(
        ingredients.flatMap((ingredient) => {
          const extractedIngredients = this.extractIngredientTerms(ingredient);

          if (extractedIngredients.length > 0) {
            return extractedIngredients;
          }

          const normalizedIngredient =
            this.normalizeIngredientToken(ingredient);

          return this.isPotentialDirectIngredientToken(normalizedIngredient)
            ? [this.normalizeIngredientAlias(normalizedIngredient)]
            : [];
        }),
      ),
    ];
  }

  private extractIngredientTerms(text: string) {
    const normalizedText = text.toLowerCase();
    const ingredients = new Set<string>();
    const normalizedTokens = normalizedText
      .replace(/[^\p{L}\p{N},\s]/gu, ' ')
      .split(/[,\s]+/)
      .map((token) => this.normalizeIngredientToken(token));

    KNOWN_INGREDIENTS.forEach((ingredient) => {
      if (ingredient.length > 1 && normalizedText.includes(ingredient)) {
        ingredients.add(this.normalizeIngredientAlias(ingredient));
      }
    });

    normalizedTokens
      .filter((token) => this.isKnownIngredientToken(token))
      .forEach((token) =>
        ingredients.add(this.normalizeIngredientAlias(token)),
      );

    this.extractInferredIngredientTokens(normalizedText).forEach((token) =>
      ingredients.add(this.normalizeIngredientAlias(token)),
    );

    return [...ingredients].slice(0, 12);
  }

  private extractInferredIngredientTokens(text: string) {
    return [
      ...new Set(
        this.extractIngredientCandidateTexts(text)
          .flatMap((candidateText) =>
            candidateText
              .replace(/[^\p{L}\p{N},\s]/gu, ' ')
              .split(/[,\s]+/),
          )
          .map((token) => this.normalizeIngredientToken(token))
          .filter((token) => this.isPotentialInferredIngredientToken(token)),
      ),
    ];
  }

  private extractIngredientCandidateTexts(text: string) {
    const candidateTexts: string[] = [];
    const inventoryMatches = text.matchAll(
      /([\p{L}\p{N},\s]+?)(?:이|가|은|는)?\s*(?:있어요|있습니다|있는데|있고|남았어요|남았습니다|남았는데|남아있어요|남아있습니다)/gu,
    );
    const cookWithMatches = text.matchAll(
      /([\p{L}\p{N},\s]+?)(?:으로|로)\s*(?:(?:[\p{L}\p{N}]{2,12})\s+)?(?:간단|요리|메뉴|무엇|무슨|만들|해먹|추천)/gu,
    );
    const labeledInventoryMatches = text.matchAll(
      /(?:보유\s*재료|가지고\s*있는\s*재료|있는\s*재료|냉장고에|집에)[:：]?\s*([\p{L}\p{N},\s]+?)(?:있|남|으로|로|가지고|갖고|추천|요리|메뉴|만들|$)/gu,
    );

    [inventoryMatches, cookWithMatches, labeledInventoryMatches].forEach(
      (matches) => {
        for (const match of matches) {
          const candidateText = match[1]?.trim();

          if (candidateText) {
            candidateTexts.push(candidateText);
          }
        }
      },
    );

    return candidateTexts;
  }

  private normalizeIngredientToken(token: string) {
    let normalizedToken = token
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '')
      .trim();

    if (!normalizedToken) {
      return '';
    }

    if (KNOWN_INGREDIENTS.includes(normalizedToken)) {
      return normalizedToken;
    }

    const suffixes = [
      '으로',
      '이랑',
      '하고',
      '에서',
      '부터',
      '까지',
      '처럼',
      '같이',
      '보다',
      '랑',
      '로',
      '은',
      '는',
      '이',
      '가',
      '을',
      '를',
      '와',
      '과',
      '만',
      '에',
      '의',
    ];

    for (const suffix of suffixes) {
      if (
        normalizedToken.length > suffix.length &&
        normalizedToken.endsWith(suffix)
      ) {
        normalizedToken = normalizedToken.slice(0, -suffix.length);
        break;
      }
    }

    return normalizedToken;
  }

  private normalizeIngredientAlias(ingredient: string) {
    return INGREDIENT_ALIASES.get(ingredient) ?? ingredient;
  }

  private isKnownIngredientToken(token: string) {
    return KNOWN_INGREDIENTS.includes(token) || INGREDIENT_ALIASES.has(token);
  }

  private isPotentialDirectIngredientToken(token: string) {
    return (
      token.length >= 2 &&
      token.length <= 12 &&
      !/\d/.test(token) &&
      !NON_INGREDIENT_TERMS.has(token)
    );
  }

  private isPotentialInferredIngredientToken(token: string) {
    return (
      this.isPotentialDirectIngredientToken(token) &&
      !/(하다|하면|해요|해주세요|됩니다|되나요|싶어요|주세요|나요|어요|습니다|는데|다면)$/.test(
        token,
      )
    );
  }

  private summarizePost(post: RagPost) {
    const content = post.content.replace(/\s+/g, ' ').trim();

    return content.length > 120 ? `${content.slice(0, 120)}...` : content;
  }

  private summarizeEvidence(post: RagPost) {
    const commentEvidence = this.getCommentEvidence(post);

    if (commentEvidence.length === 0) {
      return '아직 참고할 댓글 답변이 없습니다.';
    }

    return commentEvidence.join(' ');
  }

  private getCommentEvidence(post: RagPost) {
    return post.comments
      .map((comment) => comment.content.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  private getTags(post: Pick<RagPost, 'postTags'>) {
    return post.postTags.map((postTag) => postTag.tag.name);
  }

  private async createRecommendationThumbnailUrl(
    menuName: string,
    ingredients: string[],
  ) {
    return (
      (await this.recipeImageService.createThumbnail({
        menuName,
        ingredients,
      })) ?? this.createFoodThumbnailUrl(menuName, ingredients)
    );
  }

  private createFoodThumbnailUrl(menuName: string, ingredients: string[]) {
    const palette = this.getFoodThumbnailPalette(menuName, ingredients);
    const safeMenuName = this.escapeSvgText(menuName);
    const safeIngredientLabel = this.escapeSvgText(
      ingredients.slice(0, 3).join(' · ') || 'AI 추천 메뉴',
    );
    const svg = `
	      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" role="img" aria-label="${safeMenuName}">
	        <defs>
	          <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
	            <stop offset="0" stop-color="${palette.backgroundStart}"/>
	            <stop offset="1" stop-color="${palette.backgroundEnd}"/>
	          </linearGradient>
	          <radialGradient id="plate" cx="50%" cy="52%" r="54%">
	            <stop offset="0" stop-color="#fffdf6"/>
	            <stop offset="0.68" stop-color="#f7efe4"/>
	            <stop offset="1" stop-color="#d9cec0"/>
	          </radialGradient>
	          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
	            <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0d1210" flood-opacity="0.24"/>
	          </filter>
	        </defs>
	        <rect width="640" height="420" fill="url(#bg)"/>
	        <rect width="640" height="420" fill="#fffaf0" opacity="0.16"/>
	        <circle cx="138" cy="92" r="16" fill="${palette.herb}"/>
	        <circle cx="528" cy="108" r="13" fill="${palette.herb}"/>
	        <circle cx="88" cy="310" r="10" fill="${palette.accent}"/>
	        <circle cx="560" cy="304" r="18" fill="${palette.accent}" opacity="0.72"/>
	        <ellipse cx="320" cy="246" rx="212" ry="118" fill="url(#plate)" filter="url(#shadow)"/>
	        <ellipse cx="320" cy="238" rx="150" ry="80" fill="${palette.foodBase}"/>
	        <circle cx="268" cy="216" r="55" fill="${palette.foodLight}" opacity="0.95"/>
	        <circle cx="374" cy="224" r="67" fill="${palette.foodMain}" opacity="0.94"/>
	        <circle cx="330" cy="190" r="42" fill="${palette.accent}" opacity="0.9"/>
	        <circle cx="306" cy="246" r="24" fill="#fff5cf" opacity="0.95"/>
	        <circle cx="412" cy="254" r="18" fill="#fff3bf" opacity="0.95"/>
	        <circle cx="236" cy="276" r="13" fill="${palette.herb}"/>
	        <circle cx="448" cy="204" r="12" fill="${palette.herb}"/>
	        <rect x="78" y="42" width="150" height="38" rx="19" fill="#ffffff" opacity="0.7"/>
	        <text x="105" y="67" font-family="Pretendard, 'Noto Sans KR', Arial, sans-serif" font-size="18" font-weight="800" fill="#263229">AI 추천</text>
	        <text x="320" y="360" text-anchor="middle" font-family="Pretendard, 'Noto Sans KR', Arial, sans-serif" font-size="24" font-weight="800" fill="#1d2822">${safeMenuName}</text>
	        <text x="320" y="390" text-anchor="middle" font-family="Pretendard, 'Noto Sans KR', Arial, sans-serif" font-size="15" font-weight="600" fill="#56645d">${safeIngredientLabel}</text>
	      </svg>
	    `
      .replace(/\s+/g, ' ')
      .trim();

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  private getFoodThumbnailPalette(menuName: string, ingredients: string[]) {
    const sourceText = `${menuName} ${ingredients.join(' ')}`;

    if (/김치|고추|매운|떡볶/.test(sourceText)) {
      return {
        backgroundStart: '#fff3eb',
        backgroundEnd: '#e8f4ee',
        foodBase: '#f5753d',
        foodMain: '#dc4428',
        foodLight: '#ffb054',
        accent: '#ffd15a',
        herb: '#2e8b4f',
      };
    }

    if (/계란|달걀|오믈렛|스크램블/.test(sourceText)) {
      return {
        backgroundStart: '#fff8df',
        backgroundEnd: '#eaf4ed',
        foodBase: '#ffd35a',
        foodMain: '#f2a63a',
        foodLight: '#fff0a6',
        accent: '#ff7f3f',
        herb: '#2f8d52',
      };
    }

    if (/면|소면|파스타|국수|라면/.test(sourceText)) {
      return {
        backgroundStart: '#fff8ee',
        backgroundEnd: '#edf7f1',
        foodBase: '#f1d086',
        foodMain: '#f0a24a',
        foodLight: '#fff1bf',
        accent: '#e85b35',
        herb: '#2f8f61',
      };
    }

    if (/두부|콩|샐러드|오이|채소|야채/.test(sourceText)) {
      return {
        backgroundStart: '#f3fbf4',
        backgroundEnd: '#fff7e8',
        foodBase: '#dff0cb',
        foodMain: '#56a86a',
        foodLight: '#fff7da',
        accent: '#f6c95d',
        herb: '#247d48',
      };
    }

    return {
      backgroundStart: '#fff7eb',
      backgroundEnd: '#e9f4ef',
      foodBase: '#f6c45d',
      foodMain: '#eb6a38',
      foodLight: '#fff2b8',
      accent: '#24b99a',
      herb: '#2f8b44',
    };
  }

  private escapeSvgText(text: string) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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
      thumbnailUrl: recommendation.thumbnailUrl ?? null,
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
