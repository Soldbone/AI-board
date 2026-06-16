import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FoodMetadataService } from '../food-metadata/food-metadata.service';
import type { IngredientSetAnalysis } from '../food-metadata/food-metadata.types';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService, RAG_EMBEDDING_DIMENSION } from './embedding.service';
import { CreateBoardChatDto } from './dto/create-board-chat.dto';
import { CreateDirectRecommendationDto } from './dto/create-direct-recommendation.dto';
import { CreateRecommendationDto } from './dto/create-recommendation.dto';
import {
  RecipeLlmService,
  type RecommendationGrounding,
  type RecipeRecommendationDraft,
} from './recipe-llm.service';
import {
  AI_RECOMMENDATION_GOAL_LABELS,
  normalizeAiRecommendationGoals,
} from './recommendation-goal';
import { RecipeImageService } from './recipe-image.service';

const ragPostSelect = {
  id: true,
  title: true,
  content: true,
  category: true,
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
  category: PostCategoryCode;
  categoryLabel: string;
  sourceType: string;
  author: string;
  postUrl: string;
  viewCount: number;
  commentsCount: number;
  summary: string;
  questionSummary: string;
  commentEvidence: string[];
  tags: string[];
  similarity: number;
  semanticSimilarity: number;
  popularityScore: number;
  ingredients: string[];
  ingredientAliases: string[];
  matchedIngredients: string[];
  missingIngredients: string[];
};

type RagDocumentMetadata = {
  title: string;
  category: PostCategoryCode;
  categoryLabel: string;
  sourceType: string;
  author: string;
  postUrl: string;
  contentSummary: string;
  ingredients: string[];
  ingredientAliases: string[];
  dishNames: string[];
  cookingMethods: string[];
  situationTags: string[];
  difficulty: string;
  cookingTime: string;
  popularityScore: number;
  searchableText: string;
  documentText: string;
};

type BoardChatReference = {
  post_id: number;
  title: string;
  category: string;
  source_type: string;
  author: string;
  post_url: string;
  view_count: number;
  comment_count: number;
  score: number;
};

const DEFAULT_RAG_MIN_SIMILARITY = 0.55;
const DEFAULT_RAG_MIN_INGREDIENT_OVERLAP = 1;
const MAX_REFERENCE_POSTS = 5;
const MAX_BOARD_CHAT_REFERENCE_POSTS = 12;
const MAX_VECTOR_CANDIDATES = 25;
const POST_CATEGORY_LABELS = {
  QUESTION: '질문',
  RECIPE_SHARE: '레시피 공유',
  COOKING_TIP_REVIEW: '요리 팁/후기',
  TREND: '자유/트렌드',
} as const;
const POST_CATEGORY_SOURCE_TYPES = {
  QUESTION: '사용자 질문',
  RECIPE_SHARE: '검증된 레시피',
  COOKING_TIP_REVIEW: '사용자 팁/후기',
  TREND: '최근 맥락',
} as const;
const POST_CATEGORY_KNOWLEDGE_WEIGHT = {
  QUESTION: 0,
  RECIPE_SHARE: 1,
  COOKING_TIP_REVIEW: 0.95,
  TREND: 0.55,
} as const;
type PostCategoryCode = keyof typeof POST_CATEGORY_LABELS;
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
  '찬밥',
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
  '족발',
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
  '치킨',
  '어묵',
  '맛살',
  '만두',
  '떡',
  '김',
  '김가루',
  '미역',
  '된장',
  '쌈장',
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
  ['찬밥', '밥'],
]);
const SEMANTIC_INGREDIENT_ALIASES = new Map<string, string[]>([
  ['족발', ['돼지고기', '남은 배달음식', '고기', '볶음밥 재료']],
  ['찬밥', ['밥', '볶음밥', '죽', '주먹밥']],
  ['밥', ['찬밥', '볶음밥', '죽', '주먹밥']],
  ['쌈장', ['양념장', '된장', '고추장', '간 맞추기']],
  ['상추', ['쌈채소', '고명', '샐러드']],
  ['치킨', ['닭고기', '남은 배달음식', '튀김', '볶음밥 재료']],
  ['김치', ['볶음밥', '찌개', '반찬', '매콤한 재료']],
  ['참치', ['참치캔', '단백질', '주먹밥', '볶음밥 재료']],
  ['두부', ['단백질', '부침', '찌개', '담백한 재료']],
  ['계란', ['달걀', '단백질', '볶음밥', '아침 메뉴']],
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
  '메인재료',
  '부재료',
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
    const post = await this.assertPostExists(postId);

    if (this.getPostCategory(post) !== 'QUESTION') {
      return null;
    }

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

    if (this.getPostCategory(targetPost) !== 'QUESTION') {
      throw new BadRequestException(
        'AI recommendations are only available for question posts',
      );
    }

    const targetRagMetadata = this.buildRagDocumentMetadata(targetPost);
    const targetDocument = targetRagMetadata.searchableText;
    const targetIngredients = this.extractIngredientsFromRagPost(targetPost);
    const nutritionGoals = normalizeAiRecommendationGoals(
      createRecommendationDto.nutritionGoals ??
        createRecommendationDto.nutritionGoal,
    );
    const additionalRequest =
      createRecommendationDto.additionalRequest?.trim() ?? '';
    const targetEmbeddingResult =
      await this.embeddingService.embed(targetDocument);

    await this.upsertRagDocument(
      targetPost.id,
      targetRagMetadata,
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
          category: similarPost.categoryLabel,
          sourceType: similarPost.sourceType,
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
        nutritionGoals,
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
          nutritionMetadata: this.toRecommendationNutritionJson(nutritionMetadata),
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
    const nutritionGoals = normalizeAiRecommendationGoals(
      createDirectRecommendationDto.nutritionGoals ??
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
            `추천 목표: ${nutritionGoals
              .map((goal) => AI_RECOMMENDATION_GOAL_LABELS[goal])
              .join(', ')}`,
          ]
            .filter(Boolean)
            .join('\n'),
          tags: ingredients.slice(0, 5),
          availableIngredients: targetIngredients,
        },
        similarPosts.map((similarPost) => ({
          title: similarPost.title,
          category: similarPost.categoryLabel,
          sourceType: similarPost.sourceType,
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
        nutritionGoals,
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
          nutritionMetadata: this.toRecommendationNutritionJson(nutritionMetadata),
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

  async createBoardChat(createBoardChatDto: CreateBoardChatDto) {
    const userMessage = createBoardChatDto.message.trim();

    if (!userMessage) {
      throw new BadRequestException('Message is required');
    }

    const labeledIngredients = this.extractLabeledIngredientTerms(userMessage);
    const extractedIngredients = [
      ...new Set([
        ...this.normalizeIngredientTerms([userMessage]),
        ...labeledIngredients,
      ]),
    ].slice(0, 12);
    const primaryIngredients = this.extractPrimaryIngredientTerms(userMessage);
    const excludedConditions = this.extractExcludedConditions(userMessage);
    const situationTags = this.extractSituationTags(userMessage);
    const targetDocument = this.buildDirectRagDocument(
      extractedIngredients,
      [userMessage, excludedConditions.join(', ')].filter(Boolean).join('\n'),
    );
    const targetEmbeddingResult =
      await this.embeddingService.embed(targetDocument);
    const candidatePosts = await this.prismaService.post.findMany({
      take: 100,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: ragPostSelect,
    });
    const similarPosts = await this.findSimilarPosts(
      targetEmbeddingResult.embedding,
      candidatePosts,
      extractedIngredients,
      {
        requireCommentEvidence: false,
        useHybridScore: true,
        maxResults: MAX_BOARD_CHAT_REFERENCE_POSTS,
      },
    );
    const selectedPosts = this.selectBoardChatEvidencePosts(
      similarPosts,
      extractedIngredients,
      primaryIngredients,
    );
    const grounding = this.getRecommendationGrounding(selectedPosts);
    const scores = selectedPosts.map((post) => ({
      postId: post.postId,
      title: post.title,
      category: post.categoryLabel,
      sourceType: post.sourceType,
      score: Number(post.similarity.toFixed(4)),
      semanticSimilarity: Number(post.semanticSimilarity.toFixed(4)),
      popularityScore: Number(post.popularityScore.toFixed(2)),
      matchedIngredients: post.matchedIngredients,
    }));

    if (
      extractedIngredients.length === 0 ||
      grounding !== 'COMMUNITY_RAG' ||
      selectedPosts.length === 0
    ) {
      const answerText = this.createUnknownBoardChatAnswer();

      await this.logBoardChat({
        userMessage,
        extractedIngredients,
        retrievedPostIds: similarPosts.map((post) => post.postId),
        selectedPostIds: [],
        scores,
        answerText,
      });

      return {
        answer_text: answerText,
        references: [],
        extracted_ingredients: extractedIngredients,
        grounding: 'GENERAL_AI' satisfies RecommendationGrounding,
      };
    }

    const nutritionMetadata =
      await this.getIngredientNutritionMetadata(extractedIngredients);
    const rawRecommendationDraft =
      await this.recipeLlmService.createRecommendation(
        {
          title: '게시판 전용 AI 요리사',
          content: [
            userMessage,
            excludedConditions.length
              ? `제외 조건: ${excludedConditions.join(', ')}`
              : '',
            situationTags.length ? `상황: ${situationTags.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          tags: [...extractedIngredients, ...situationTags].slice(0, 8),
          availableIngredients: extractedIngredients,
        },
        selectedPosts.map((similarPost) => ({
          title: similarPost.title,
          category: similarPost.categoryLabel,
          sourceType: similarPost.sourceType,
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
        'BALANCED',
      );
    const recommendationDraft = this.completeRecommendationDraft(
      rawRecommendationDraft,
      extractedIngredients,
    );
    const references =
      grounding === 'COMMUNITY_RAG'
        ? selectedPosts.map((post) => ({
            post_id: post.postId,
            title: post.title,
            category: post.categoryLabel,
            source_type: post.sourceType,
            author: post.author,
            post_url: post.postUrl,
            view_count: post.viewCount,
            comment_count: post.commentsCount,
            score: Number(post.similarity.toFixed(4)),
          }))
        : [];
    const answerText = this.formatBoardChatAnswer(
      userMessage,
      recommendationDraft,
      references,
      grounding,
    );

    await this.logBoardChat({
      userMessage,
      extractedIngredients,
      retrievedPostIds: similarPosts.map((post) => post.postId),
      selectedPostIds: selectedPosts.map((post) => post.postId),
      scores,
      answerText,
    });

    return {
      answer_text: answerText,
      references,
      extracted_ingredients: extractedIngredients,
      grounding,
    };
  }

  async rebuildRagDocuments() {
    const posts = await this.prismaService.post.findMany({
      take: 500,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: ragPostSelect,
    });
    let syncedCount = 0;
    let failedCount = 0;

    for (const post of posts) {
      const synced = await this.syncRagDocumentForRagPost(post);

      if (synced) {
        syncedCount += 1;
      } else {
        failedCount += 1;
      }
    }

    return {
      total: posts.length,
      syncedCount,
      failedCount,
    };
  }

  async syncRagDocumentForPost(postId: number) {
    try {
      const post = await this.findRagPost(postId);

      return await this.syncRagDocumentForRagPost(post);
    } catch (error) {
      console.warn(`Failed to sync RAG document for post ${postId}`, error);
      return false;
    }
  }

  private async assertPostExists(postId: number) {
    const post = await this.prismaService.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
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

    return post;
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

  private toRecommendationNutritionJson(
    metadata: IngredientSetAnalysis | null,
  ) {
    return metadata
      ? (metadata as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;
  }

  private parseRecommendationNutritionMetadata(
    value: Prisma.JsonValue | null,
  ): IngredientSetAnalysis | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const metadata = value as Partial<IngredientSetAnalysis>;

    if (!Array.isArray(metadata.ingredients) || !metadata.dataSource) {
      return null;
    }

    return metadata as IngredientSetAnalysis;
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
    options: {
      requireCommentEvidence?: boolean;
      useHybridScore?: boolean;
      maxResults?: number;
    } = {},
  ): Promise<SimilarPost[]> {
    if (candidatePosts.length === 0) {
      return [];
    }

    try {
      await Promise.all(
        candidatePosts.map(async (post) => {
          const ragMetadata = this.buildRagDocumentMetadata(post);
          const embeddingResult =
            await this.embeddingService.embed(ragMetadata.searchableText);

          await this.upsertRagDocument(
            post.id,
            ragMetadata,
            embeddingResult.embedding,
            embeddingResult.model,
          );
        }),
      );

      return await this.findSimilarPostsWithPgvector(
        targetEmbedding,
        candidatePosts,
        targetIngredients,
        options,
      );
    } catch {
      return this.findSimilarPostsInMemory(
        targetEmbedding,
        candidatePosts,
        targetIngredients,
        options,
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
    metadata: RagDocumentMetadata,
    embedding: number[],
    embeddingModel: string,
  ) {
    const vectorLiteral = this.toVectorLiteral(embedding);

    try {
      await this.prismaService.$executeRaw`
        INSERT INTO "PostRagDocument"
          (
            "postId",
            "title",
            "author",
            "postUrl",
            "contentSummary",
            "ingredients",
            "ingredientAliases",
            "dishNames",
            "cookingMethods",
            "situationTags",
            "difficulty",
            "cookingTime",
            "popularityScore",
            "searchableText",
            "documentText",
            "embedding",
            "embeddingModel",
            "embeddedAt",
            "isStale",
            "createdAt",
            "updatedAt"
          )
        VALUES
          (
            ${postId},
            ${metadata.title},
            ${metadata.author},
            ${metadata.postUrl},
            ${metadata.contentSummary},
            ${metadata.ingredients},
            ${metadata.ingredientAliases},
            ${metadata.dishNames},
            ${metadata.cookingMethods},
            ${metadata.situationTags},
            ${metadata.difficulty},
            ${metadata.cookingTime},
            ${metadata.popularityScore},
            ${metadata.searchableText},
            ${metadata.documentText},
            ${vectorLiteral}::vector,
            ${embeddingModel},
            NOW(),
            false,
            NOW(),
            NOW()
          )
        ON CONFLICT ("postId") DO UPDATE SET
          "title" = EXCLUDED."title",
          "author" = EXCLUDED."author",
          "postUrl" = EXCLUDED."postUrl",
          "contentSummary" = EXCLUDED."contentSummary",
          "ingredients" = EXCLUDED."ingredients",
          "ingredientAliases" = EXCLUDED."ingredientAliases",
          "dishNames" = EXCLUDED."dishNames",
          "cookingMethods" = EXCLUDED."cookingMethods",
          "situationTags" = EXCLUDED."situationTags",
          "difficulty" = EXCLUDED."difficulty",
          "cookingTime" = EXCLUDED."cookingTime",
          "popularityScore" = EXCLUDED."popularityScore",
          "searchableText" = EXCLUDED."searchableText",
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
    options: {
      requireCommentEvidence?: boolean;
      useHybridScore?: boolean;
      maxResults?: number;
    },
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
          Boolean(options.useHybridScore),
        );
      })
      .filter((post): post is SimilarPost => Boolean(post))
      .filter((post) =>
        this.isStrongSimilarPost(post, targetIngredients, options),
      )
      .sort(
        (firstPost, secondPost) => secondPost.similarity - firstPost.similarity,
      )
      .slice(0, options.maxResults ?? MAX_REFERENCE_POSTS);
  }

  private async findSimilarPostsInMemory(
    targetEmbedding: number[],
    candidatePosts: RagPost[],
    targetIngredients: string[],
    options: {
      requireCommentEvidence?: boolean;
      useHybridScore?: boolean;
      maxResults?: number;
    },
  ) {
    const scoredPosts = await Promise.all(
      candidatePosts.map(async (post) => {
        const ragMetadata = this.buildRagDocumentMetadata(post);
        const embeddingResult =
          await this.embeddingService.embed(ragMetadata.searchableText);
        const similarity = this.embeddingService.cosineSimilarity(
          targetEmbedding,
          embeddingResult.embedding,
        );

        return this.buildSimilarPost(
          post,
          similarity,
          targetIngredients,
          Boolean(options.useHybridScore),
        );
      }),
    );

    return scoredPosts
      .filter((post) =>
        this.isStrongSimilarPost(post, targetIngredients, options),
      )
      .sort(
        (firstPost, secondPost) => secondPost.similarity - firstPost.similarity,
      )
      .slice(0, options.maxResults ?? MAX_REFERENCE_POSTS);
  }

  private buildSimilarPost(
    post: RagPost,
    semanticSimilarity: number,
    targetIngredients: string[],
    useHybridScore = false,
  ): SimilarPost {
    const category = this.getPostCategory(post);
    const ingredients = this.extractIngredientsFromRagPost(post);
    const ingredientAliases = this.getIngredientSemanticAliases(ingredients);
    const targetIngredientSet = new Set(targetIngredients);
    const expandedTargetIngredients = new Set(
      targetIngredients.flatMap((ingredient) => [
        ingredient,
        ...this.getIngredientSemanticAliases([ingredient]),
      ]),
    );
    const matchedIngredients = ingredients.filter((ingredient) =>
      targetIngredientSet.has(ingredient) ||
      expandedTargetIngredients.has(ingredient) ||
      this.getIngredientSemanticAliases([ingredient]).some((alias) =>
        expandedTargetIngredients.has(alias),
      ),
    );
    const similarity = this.calculateHybridSimilarity(
      post,
      semanticSimilarity,
      ingredients,
      ingredientAliases,
      targetIngredients,
    );
    const popularityScore = this.calculatePopularityScore(post);

    return {
      postId: post.id,
      title: post.title,
      category,
      categoryLabel: POST_CATEGORY_LABELS[category],
      sourceType: POST_CATEGORY_SOURCE_TYPES[category],
      author: this.getPostAuthorNickname(post),
      postUrl: `/posts/${post.id}`,
      viewCount: post.viewCount,
      commentsCount: post._count.comments,
      summary: this.summarizeEvidence(post),
      questionSummary: this.summarizePost(post),
      commentEvidence: this.getCommentEvidence(post),
      tags: this.getTags(post),
      similarity: useHybridScore ? similarity : semanticSimilarity,
      semanticSimilarity,
      popularityScore,
      ingredients,
      ingredientAliases,
      matchedIngredients,
      missingIngredients: ingredients.filter(
        (ingredient) => !matchedIngredients.includes(ingredient),
      ),
    };
  }

  private isStrongSimilarPost(
    post: SimilarPost,
    targetIngredients: string[],
    options: {
      requireCommentEvidence?: boolean;
    } = {},
  ) {
    if (post.category === 'QUESTION' && post.commentEvidence.length === 0) {
      return false;
    }

    if (
      options.requireCommentEvidence !== false &&
      post.commentEvidence.length === 0 &&
      !this.isKnowledgeSourceCategory(post.category)
    ) {
      return false;
    }

    if (targetIngredients.length === 0) {
      return post.semanticSimilarity >= this.getRagMinSimilarity();
    }

    if (post.matchedIngredients.length >= this.getRagMinIngredientOverlap()) {
      return true;
    }

    return (
      post.semanticSimilarity >= this.getRagMinSimilarity() &&
      this.isKnowledgeSourceCategory(post.category)
    );
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

  private async syncRagDocumentForRagPost(post: RagPost) {
    const ragMetadata = this.buildRagDocumentMetadata(post);

    try {
      const embeddingResult =
        await this.embeddingService.embed(ragMetadata.searchableText);

      return await this.upsertRagDocument(
        post.id,
        ragMetadata,
        embeddingResult.embedding,
        embeddingResult.model,
      );
    } catch (error) {
      console.warn(`Failed to create RAG document for post ${post.id}`, error);
      return false;
    }
  }

  private buildRagDocumentMetadata(post: RagPost): RagDocumentMetadata {
    const category = this.getPostCategory(post);
    const tags = this.getTags(post);
    const ingredients = this.extractIngredientsFromRagPost(post);
    const ingredientAliases = this.getIngredientSemanticAliases(ingredients);
    const dishNames = this.inferDishNames(post);
    const cookingMethods = this.inferCookingMethods(post);
    const situationTags = this.extractSituationTags(
      [post.title, post.content, tags.join(' ')].join(' '),
    );
    const contentSummary = this.summarizePost(post);
    const difficulty = this.inferDifficulty(post);
    const cookingTime = this.inferCookingTime(post);
    const popularityScore = this.calculatePopularityScore(post);
    const searchableText = [
      `게시판 성격: ${POST_CATEGORY_LABELS[category]}`,
      `지식 소스 유형: ${POST_CATEGORY_SOURCE_TYPES[category]}`,
      `제목: ${post.title}`,
      `요약: ${contentSummary}`,
      `재료: ${ingredients.join(', ') || '재료 없음'}`,
      `대체/관련 재료: ${ingredientAliases.join(', ') || '없음'}`,
      `요리명: ${dishNames.join(', ') || post.title}`,
      `조리 방식: ${cookingMethods.join(', ') || '미정'}`,
      `상황 태그: ${situationTags.join(', ') || tags.join(', ') || '없음'}`,
      `게시글 반응: 조회수 ${post.viewCount}, 댓글 ${post._count.comments}`,
    ].join('\n');

    return {
      title: post.title,
      category,
      categoryLabel: POST_CATEGORY_LABELS[category],
      sourceType: POST_CATEGORY_SOURCE_TYPES[category],
      author: this.getPostAuthorNickname(post),
      postUrl: `/posts/${post.id}`,
      contentSummary,
      ingredients,
      ingredientAliases,
      dishNames,
      cookingMethods,
      situationTags,
      difficulty,
      cookingTime,
      popularityScore,
      searchableText,
      documentText: this.buildRagDocument(post),
    };
  }

  private calculateHybridSimilarity(
    post: RagPost,
    semanticSimilarity: number,
    ingredients: string[],
    ingredientAliases: string[],
    targetIngredients: string[],
  ) {
    const targetSet = new Set(targetIngredients);
    const expandedTargetSet = new Set(
      targetIngredients.flatMap((ingredient) => [
        ingredient,
        ...this.getIngredientSemanticAliases([ingredient]),
      ]),
    );
    const directMatchScore = targetIngredients.length
      ? ingredients.filter((ingredient) => targetSet.has(ingredient)).length /
        targetIngredients.length
      : 0;
    const aliasMatchScore = targetIngredients.length
      ? [...new Set([...ingredients, ...ingredientAliases])].filter((token) =>
          expandedTargetSet.has(token),
        ).length / Math.max(targetIngredients.length, 1)
      : 0;
    const situationScore = this.extractSituationTags(
      [post.title, post.content, ...this.getTags(post)].join(' '),
    ).length
      ? 0.5
      : 0;
    const popularityScore = Math.min(this.calculatePopularityScore(post) / 100, 1);
    const recencyScore = this.calculateRecencyScore(post.createdAt);
    const categoryScore = this.getCategoryKnowledgeWeight(this.getPostCategory(post));

    return Math.min(
      1,
      semanticSimilarity * 0.35 +
        Math.min(directMatchScore, 1) * 0.3 +
        Math.min(aliasMatchScore, 1) * 0.15 +
        categoryScore * 0.1 +
        situationScore * 0.08 +
        recencyScore * 0.04 +
        popularityScore * 0.03,
    );
  }

  private calculatePopularityScore(post: RagPost) {
    return post.viewCount * 0.05 + post._count.comments * 3;
  }

  private calculateRecencyScore(createdAt: Date) {
    const ageMs = Date.now() - createdAt.getTime();
    const ageDays = Math.max(ageMs / 86_400_000, 0);

    return Math.max(0, 1 - ageDays / 30);
  }

  private getIngredientSemanticAliases(ingredients: string[]) {
    return [
      ...new Set(
        ingredients.flatMap((ingredient) => {
          const normalizedIngredient = this.normalizeIngredientAlias(
            this.normalizeIngredientToken(ingredient),
          );

          return [
            ...(SEMANTIC_INGREDIENT_ALIASES.get(ingredient) ?? []),
            ...(SEMANTIC_INGREDIENT_ALIASES.get(normalizedIngredient) ?? []),
          ];
        }),
      ),
    ].slice(0, 20);
  }

  private inferDishNames(post: RagPost) {
    const text = `${post.title} ${post.content}`;
    const dishNames = new Set<string>();
    const dishPatterns = [
      /([\p{L}\p{N}\s]{1,16}(?:볶음밥|주먹밥|죽|찌개|국|볶음면|비빔면|샐러드|덮밥|전|부침|구이|조림))/gu,
    ];

    dishPatterns.forEach((pattern) => {
      for (const match of text.matchAll(pattern)) {
        const dishName = match[1]?.replace(/\s+/g, ' ').trim();

        if (dishName && dishName.length <= 24) {
          dishNames.add(dishName);
        }
      }
    });

    return [...dishNames].slice(0, 5);
  }

  private inferCookingMethods(post: RagPost) {
    const text = `${post.title} ${post.content}`;
    const methodPatterns = [
      ['볶음', ['볶', '볶음밥']],
      ['끓임', ['끓', '국', '찌개', '죽']],
      ['비빔', ['비빔', '무침']],
      ['구이', ['굽', '구이']],
      ['한 그릇 요리', ['덮밥', '볶음밥', '주먹밥']],
      ['간단요리', ['간단', '10분', '5분']],
    ] as const;

    return methodPatterns
      .filter(([, patterns]) => patterns.some((pattern) => text.includes(pattern)))
      .map(([method]) => method);
  }

  private extractSituationTags(text: string) {
    const situationPatterns = [
      ['남은음식', ['남은', '먹다 남은', '남았']],
      ['찬밥처리', ['찬밥']],
      ['배달음식활용', ['배달', '족발', '치킨']],
      ['10분요리', ['10분', '5분', '빨리', '간단']],
      ['저녁메뉴', ['저녁']],
      ['아침메뉴', ['아침']],
      ['매운맛제외', ['매운 건 싫', '맵지 않']],
    ] as const;

    return [
      ...new Set(
        situationPatterns
          .filter(([, patterns]) =>
            patterns.some((pattern) => text.includes(pattern)),
          )
          .map(([tag]) => tag),
      ),
    ];
  }

  private inferDifficulty(post: RagPost) {
    const text = `${post.title} ${post.content}`;

    if (/간단|5분|10분|쉬운|쉽게/.test(text)) {
      return '쉬움';
    }

    if (/오븐|손질|숙성|육수|반죽/.test(text)) {
      return '보통';
    }

    return '미정';
  }

  private inferCookingTime(post: RagPost) {
    const minutes = this.extractCookingMinutes(`${post.title} ${post.content}`);

    return minutes ? `${minutes}분` : '미정';
  }

  private selectBoardChatEvidencePosts(
    similarPosts: SimilarPost[],
    extractedIngredients: string[],
    primaryIngredients: string[] = [],
  ) {
    if (extractedIngredients.length === 0) {
      return [];
    }

    const primaryIngredientSet = new Set(primaryIngredients);
    const minimumMatchedIngredients =
      extractedIngredients.length >= 4 ? 2 : 1;

    return similarPosts
      .filter((post) => {
        const hasPrimaryIngredientMatch = post.matchedIngredients.some(
          (ingredient) => primaryIngredientSet.has(ingredient),
        );

        return (
          hasPrimaryIngredientMatch ||
          post.matchedIngredients.length >= minimumMatchedIngredients
        );
      })
      .filter((post) => post.similarity >= 0.35 || post.semanticSimilarity >= 0.55)
      .sort((firstPost, secondPost) => {
        const primaryIngredientGap =
          Number(
            secondPost.matchedIngredients.some((ingredient) =>
              primaryIngredientSet.has(ingredient),
            ),
          ) -
          Number(
            firstPost.matchedIngredients.some((ingredient) =>
              primaryIngredientSet.has(ingredient),
            ),
          );

        if (primaryIngredientGap !== 0) {
          return primaryIngredientGap;
        }

        const matchedIngredientGap =
          secondPost.matchedIngredients.length - firstPost.matchedIngredients.length;

        if (matchedIngredientGap !== 0) {
          return matchedIngredientGap;
        }

        const priorityGap =
          this.getCategoryKnowledgeWeight(secondPost.category) -
          this.getCategoryKnowledgeWeight(firstPost.category);

        if (priorityGap !== 0) {
          return priorityGap;
        }

        return secondPost.similarity - firstPost.similarity;
      })
      .slice(0, 3);
  }

  private extractPrimaryIngredientTerms(text: string) {
    const primaryIngredientTexts = [
      ...text.matchAll(
        /(?:메인\s*재료|주\s*재료)(?:[:：]|은|는)?\s*([\p{L}\p{N},\s]+?)(?=(?:부\s*재료|서브\s*재료|추가\s*재료|보조\s*재료)(?:[:：]|은|는)?|$)/gu,
      ),
    ].map((match) => match[1]);

    return this.extractIngredientTermsFromStructuredTexts(primaryIngredientTexts);
  }

  private extractLabeledIngredientTerms(text: string) {
    const labeledIngredientTexts = [
      ...text.matchAll(
        /(?:메인\s*재료|주\s*재료|부\s*재료|서브\s*재료|추가\s*재료|보조\s*재료)(?:[:：]|은|는)?\s*([\p{L}\p{N},\s]+?)(?=(?:메인\s*재료|주\s*재료|부\s*재료|서브\s*재료|추가\s*재료|보조\s*재료)(?:[:：]|은|는)?|$)/gu,
      ),
    ].map((match) => match[1]);

    return this.extractIngredientTermsFromStructuredTexts(labeledIngredientTexts);
  }

  private extractCookingMinutes(content: string) {
    const match = content.match(/(\d{1,3})\s*분/);

    return match ? Number(match[1]) : null;
  }

  private extractExcludedConditions(message: string) {
    const conditions: string[] = [];

    if (/매운\s*건\s*싫|맵지\s*않|안\s*맵/.test(message)) {
      conditions.push('매운맛 제외');
    }

    if (/오래\s*걸리|시간\s*없|빨리|10분/.test(message)) {
      conditions.push('짧은 조리 시간');
    }

    return conditions;
  }

  private formatBoardChatAnswer(
    userMessage: string,
    recommendation: RecipeRecommendationDraft,
    references: BoardChatReference[],
    grounding: RecommendationGrounding,
  ) {
    const hasCommunityReferences =
      grounding === 'COMMUNITY_RAG' && references.length > 0;
    const foodSafetyNotice = this.hasFoodSafetyRisk(userMessage)
      ? '먼저 냄새가 시거나 끈적하고 색이 이상하면 사용하지 않는 게 좋아요.\n\n'
      : '';
    const referenceText = hasCommunityReferences
      ? references
          .map(
            (reference) =>
              `- ${reference.category}(${reference.source_type}) "${reference.title}" / ${reference.author} / 조회수 ${reference.view_count}`,
          )
          .join('\n')
      : this.createUnknownBoardChatAnswer();

    return [
      foodSafetyNotice +
        `추천 요리: ${recommendation.menuName}\n` +
        `추천 이유: ${
          hasCommunityReferences
            ? `게시판의 레시피/팁/후기 데이터를 우선 참고했습니다. ${recommendation.reason}`
            : recommendation.reason
        }`,
      `사용 가능한 재료: ${
        recommendation.availableIngredients.join(', ') || '입력한 재료'
      }`,
      `추가로 있으면 좋은 재료: ${
        recommendation.missingIngredients.length
          ? recommendation.missingIngredients.join(', ')
          : '없음'
      }`,
      `간단 조리법:\n${this.formatRecipeSteps(recommendation.content)}`,
      `참고한 게시글:\n${referenceText}`,
      '추가 팁: 가진 재료를 먼저 쓰고 간은 마지막에 조금씩 맞춰보세요.',
    ].join('\n\n');
  }

  private createUnknownBoardChatAnswer() {
    return '현재 가진 데이터로는 확인할 수 없습니다. 게시판에서 관련 정보를 찾지 못했습니다.';
  }

  private formatRecipeSteps(content: string) {
    const steps = content
      .split(/(?=\d+\.\s*)/)
      .map((step) => step.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean);
    const normalizedSteps = steps.length > 0 ? steps : [content.trim()];

    return normalizedSteps
      .slice(0, 5)
      .map((step, index) => `${index + 1}. ${step}`)
      .join('\n');
  }

  private hasFoodSafetyRisk(message: string) {
    return /유통기한\s*지난|상한|시큼|냄새|끈적|곰팡/.test(message);
  }

  private async logBoardChat({
    userMessage,
    extractedIngredients,
    retrievedPostIds,
    selectedPostIds,
    scores,
    answerText,
  }: {
    userMessage: string;
    extractedIngredients: string[];
    retrievedPostIds: number[];
    selectedPostIds: number[];
    scores: Array<Record<string, unknown>>;
    answerText: string;
  }) {
    try {
      await this.prismaService.$executeRaw`
        INSERT INTO "BoardRagChatLog"
          (
            "userMessage",
            "extractedIngredients",
            "retrievedPostIds",
            "selectedPostIds",
            "scores",
            "answerText",
            "createdAt"
          )
        VALUES
          (
            ${userMessage},
            ${extractedIngredients},
            ${retrievedPostIds},
            ${selectedPostIds},
            ${JSON.stringify(scores)}::jsonb,
            ${answerText},
            NOW()
          )
      `;
    } catch (error) {
      console.warn('Failed to save board RAG chat log', error);
    }
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
      '[게시판 성격]',
      POST_CATEGORY_LABELS[this.getPostCategory(post)],
      '',
      '[지식 소스 유형]',
      POST_CATEGORY_SOURCE_TYPES[this.getPostCategory(post)],
      '',
      '[제목]',
      post.title,
      '',
      '[작성자]',
      this.getPostAuthorNickname(post),
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
    const tags = this.getTags(post);

    return [
      ...new Set([
        ...this.extractIngredientTerms([post.title, post.content].join(' ')),
        ...this.extractIngredientTermsFromStructuredTexts(tags),
      ]),
    ].slice(0, 12);
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

  private extractIngredientTermsFromStructuredTexts(texts: string[]) {
    return [
      ...new Set(
        texts
          .flatMap((text) =>
            text
              .replace(/[^\p{L}\p{N},\s]/gu, ' ')
              .split(/[,\s]+/),
          )
          .map((token) => this.normalizeIngredientToken(token))
          .filter((token) => this.isPotentialInferredIngredientToken(token))
          .map((token) => this.normalizeIngredientAlias(token)),
      ),
    ].slice(0, 12);
  }

  private extractInferredIngredientTokens(text: string) {
    return [
      ...new Set(
        this.extractIngredientCandidateTexts(text)
          .filter((candidateText) =>
            this.hasIngredientListSignal(candidateText),
          )
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

  private hasIngredientListSignal(text: string) {
    if (text.includes(',')) {
      return true;
    }

    return text
      .split(/\s+/)
      .some((token) => /(이랑|하고|랑|와|과)$/.test(token.trim()));
  }

  private extractIngredientCandidateTexts(text: string) {
    const candidateTexts: string[] = [];
    const inventoryPredicate =
      '있어요|있습니다|있는데|있고|있어서|있음|남았어요|남았습니다|남았는데|남아있어요|남아있습니다|남아있는데';
    const inventoryMatches = text.matchAll(
      new RegExp(
        `([\\p{L}\\p{N},\\s]+?)(?:이|가|은|는)?\\s*(?:${inventoryPredicate})`,
        'gu',
      ),
    );
    const cookWithMatches = text.matchAll(
      /([\p{L}\p{N},\s]+?)(?:으로|로)\s*(?:(?:[\p{L}\p{N}]{2,12})\s+)?(?:간단|요리|메뉴|무엇|무슨|만들|해먹|추천)/gu,
    );
    const explicitInventoryMatches = text.matchAll(
      new RegExp(
        `(?:보유\\s*재료|가지고\\s*있는\\s*재료|있는\\s*재료)[:：]?\\s*([\\p{L}\\p{N},\\s]+?)(?:${inventoryPredicate}|으로|로|가지고|갖고|추천|요리|메뉴|만들|$)`,
        'gu',
      ),
    );
    const locationInventoryMatches = text.matchAll(
      new RegExp(
        `(?:냉장고에|집에)[:：]?\\s*([\\p{L}\\p{N},\\s]+?)(?:${inventoryPredicate})`,
        'gu',
      ),
    );

    [
      inventoryMatches,
      cookWithMatches,
      explicitInventoryMatches,
      locationInventoryMatches,
    ].forEach((matches) => {
      for (const match of matches) {
        const candidateText = match[1]?.trim();

        if (candidateText) {
          candidateTexts.push(candidateText);
        }
      }
    });

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
      !/(메뉴|추천|뭐|무엇|어떤|오늘|점심|아침|저녁|식단|급식)/.test(token) &&
      !this.looksLikeKoreanPredicateOrAdverb(token) &&
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

  private looksLikeKoreanPredicateOrAdverb(token: string) {
    if (this.isKnownIngredientToken(token)) {
      return false;
    }

    if (
      /(까요|을까요|ㄹ까요|나요|습니까|어요|습니다|는데요|네요|게|도록|려고|면서|거나|는지|은지|던데|더라)$/.test(
        token,
      )
    ) {
      return true;
    }

    return this.endsWithRieulFinalSyllable(token);
  }

  private endsWithRieulFinalSyllable(token: string) {
    const lastChar = token.at(-1);

    if (!lastChar) {
      return false;
    }

    const codePoint = lastChar.codePointAt(0);

    if (codePoint === undefined || codePoint < 0xac00 || codePoint > 0xd7a3) {
      return false;
    }

    const jongseongIndex = (codePoint - 0xac00) % 28;

    return jongseongIndex === 8;
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

  private getPostCategory(post: Pick<RagPost, 'title' | 'content' | 'postTags'> & {
    category?: string | null;
  }): PostCategoryCode {
    if (post.category && post.category in POST_CATEGORY_LABELS) {
      return post.category as PostCategoryCode;
    }

    const text = [post.title, post.content, ...this.getTags(post)].join(' ');

    if (/후기|리뷰|팁|간\s*조절|실패|성공|데우/.test(text)) {
      return 'COOKING_TIP_REVIEW';
    }

    if (/레시피|만들기|조림|볶음밥|마파두부|조리법|만드는\s*법/.test(text)) {
      return 'RECIPE_SHARE';
    }

    if (/요즘|유행|트렌드|마트|싸다|많이\s*해먹/.test(text)) {
      return 'TREND';
    }

    return 'QUESTION';
  }

  private isKnowledgeSourceCategory(category: PostCategoryCode) {
    return category !== 'QUESTION';
  }

  private getCategoryKnowledgeWeight(category: PostCategoryCode) {
    return POST_CATEGORY_KNOWLEDGE_WEIGHT[category];
  }

  private getPostAuthorNickname(post: RagPost) {
    return post.author?.nickname ?? '익명';
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
      nutritionMetadata: this.parseRecommendationNutritionMetadata(
        recommendation.nutritionMetadata,
      ),
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
