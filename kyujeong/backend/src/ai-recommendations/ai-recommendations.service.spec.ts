import { Test, TestingModule } from '@nestjs/testing';
import { FoodMetadataService } from '../food-metadata/food-metadata.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiRecommendationsService } from './ai-recommendations.service';
import { EmbeddingService } from './embedding.service';
import { RecipeImageService } from './recipe-image.service';
import { RecipeLlmService } from './recipe-llm.service';

describe('AiRecommendationsService', () => {
  const originalEnv = process.env;
  let service: AiRecommendationsService;
  let prismaService: PrismaService;
  let embeddingService: EmbeddingService;
  let recipeLlmService: RecipeLlmService;
  let recipeImageService: RecipeImageService;
  let foodMetadataService: FoodMetadataService;

  const emptyNutritionMetadata = {
    originalInputs: [],
    normalizedInputs: [],
    ingredients: [],
    totals: {
      energyKcal: null,
      carbohydrateG: null,
      proteinG: null,
      fatG: null,
      sugarG: null,
      sodiumMg: null,
    },
    perIngredientAverage: {
      energyKcal: null,
      carbohydrateG: null,
      proteinG: null,
      fatG: null,
      sugarG: null,
      sodiumMg: null,
    },
    dataSource: 'test',
    matchStatus: 'not_found',
    notes: [],
  };

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: '',
      OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
      OPENAI_CHAT_MODEL: 'gpt-4o-mini',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiRecommendationsService,
        {
          provide: PrismaService,
          useValue: {
            aiRecipeRecommendation: {
              count: jest.fn(),
              create: jest.fn(),
              findFirst: jest.fn(),
            },
            $queryRaw: jest.fn().mockResolvedValue([
              {
                available: true,
                installed: true,
              },
            ]),
            $executeRaw: jest.fn(),
            post: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
            postRagDocument: {
              upsert: jest.fn(),
            },
          },
        },
        {
          provide: EmbeddingService,
          useValue: {
            embed: jest.fn(),
            cosineSimilarity: jest.fn(),
          },
        },
        {
          provide: RecipeLlmService,
          useValue: {
            createRecommendation: jest.fn(),
          },
        },
        {
          provide: RecipeImageService,
          useValue: {
            createThumbnail: jest.fn().mockResolvedValue(null),
            getStatus: jest.fn(() => ({
              configured: false,
              enabled: false,
              model: 'gpt-image-1',
            })),
          },
        },
        {
          provide: FoodMetadataService,
          useValue: {
            analyzeIngredientsNutrition: jest
              .fn()
              .mockResolvedValue(emptyNutritionMetadata),
          },
        },
      ],
    }).compile();

    service = module.get<AiRecommendationsService>(AiRecommendationsService);
    prismaService = module.get<PrismaService>(PrismaService);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);
    recipeLlmService = module.get<RecipeLlmService>(RecipeLlmService);
    recipeImageService = module.get<RecipeImageService>(RecipeImageService);
    foodMetadataService = module.get<FoodMetadataService>(FoodMetadataService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should report fallback mode when OPENAI_API_KEY is empty', async () => {
    await expect(service.getStatus()).resolves.toEqual({
      mode: 'FALLBACK',
      openAiConfigured: false,
      embeddingModel: 'local-hash-v1',
      chatModel: null,
      dailyLimit: null,
      pgvectorAvailable: true,
      pgvectorInstalled: true,
      ragMinSimilarity: 0.55,
      ragMinIngredientOverlap: 1,
      imageGenerationConfigured: false,
      imageGenerationEnabled: false,
      imageModel: 'gpt-image-1',
      pgvectorDecision:
        'pgvector is installed; vector search is the primary retrieval path.',
    });
  });

  it('should report OpenAI mode when OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_EMBEDDING_MODEL = 'custom-embedding';
    process.env.OPENAI_CHAT_MODEL = 'custom-chat';
    jest.spyOn(recipeImageService, 'getStatus').mockReturnValue({
      configured: true,
      enabled: false,
      model: 'custom-image',
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      mode: 'OPENAI',
      openAiConfigured: true,
      embeddingModel: 'custom-embedding',
      chatModel: 'custom-chat',
      imageGenerationConfigured: true,
      imageGenerationEnabled: false,
      imageModel: 'custom-image',
    });
  });

  it('should create a general AI recommendation when there are no similar posts', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([]);
    jest.spyOn(embeddingService, 'embed').mockResolvedValue({
      model: 'local-hash-v1',
      embedding: [1, 0, 0],
    });
    jest.spyOn(recipeLlmService, 'createRecommendation').mockResolvedValue({
      menuName: '김치 계란 볶음밥',
      reason: '현재 입력과 일반 요리 지식을 기준으로 추천합니다.',
      availableIngredients: ['김치', '계란'],
      missingIngredients: [],
      estimatedCookingTime: 10,
      difficulty: '쉬움',
      content: '김치와 계란을 볶아 밥과 섞어주세요.',
    });
    jest
      .spyOn(recipeImageService, 'createThumbnail')
      .mockResolvedValue('data:image/jpeg;base64,test');
    jest
      .spyOn(prismaService.aiRecipeRecommendation, 'create')
      .mockResolvedValue({
        id: 1,
        postId: null,
        requestedById: 1,
        menuName: '김치 계란 볶음밥',
        reason: '현재 입력과 일반 요리 지식을 기준으로 추천합니다.',
        availableIngredients: ['김치', '계란'],
        missingIngredients: [],
        estimatedCookingTime: 10,
        difficulty: '쉬움',
        content: '김치와 계란을 볶아 밥과 섞어주세요.',
        thumbnailUrl: 'data:image/jpeg;base64,test',
        status: 'ACTIVE',
        grounding: 'GENERAL_AI',
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        references: [],
      } as never);

    const recommendation = await service.createDirect(
      {
        ingredients: ['김치', '계란'],
        conditions: '10분 안에',
      },
      1,
    );

    expect(recipeLlmService.createRecommendation).toHaveBeenCalledWith(
      expect.any(Object),
      [],
      'GENERAL_AI',
      null,
      'BALANCED',
    );
    expect(prismaService.aiRecipeRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grounding: 'GENERAL_AI',
          thumbnailUrl: 'data:image/jpeg;base64,test',
        }),
      }),
    );
    expect(recommendation.grounding).toBe('GENERAL_AI');
    expect(recommendation.referencedPosts).toEqual([]);
  });

  it('should remove missing ingredients that are not mentioned in the recommendation', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([]);
    jest.spyOn(embeddingService, 'embed').mockResolvedValue({
      model: 'local-hash-v1',
      embedding: [1, 0, 0],
    });
    jest.spyOn(recipeLlmService, 'createRecommendation').mockResolvedValue({
      menuName: '애호박 계란 볶음',
      reason: '애호박과 계란을 함께 볶으면 부드럽고 담백합니다.',
      availableIngredients: ['애호박', '계란'],
      usedIngredients: ['애호박', '계란'],
      missingIngredients: ['밥', '면', '마늘', '간장'],
      estimatedCookingTime: 15,
      difficulty: '쉬움',
      content:
        '애호박을 반달 모양으로 썰고 계란을 풀어 함께 볶아 접시에 담습니다.',
    });
    jest
      .spyOn(prismaService.aiRecipeRecommendation, 'create')
      .mockResolvedValue({
        id: 2,
        postId: null,
        requestedById: 1,
        menuName: '애호박 계란 볶음',
        reason: '애호박과 계란을 함께 볶으면 부드럽고 담백합니다.',
        availableIngredients: ['애호박', '계란'],
        missingIngredients: [],
        estimatedCookingTime: 15,
        difficulty: '쉬움',
        content:
          '애호박을 반달 모양으로 썰고 계란을 풀어 함께 볶아 접시에 담습니다.',
        thumbnailUrl: null,
        status: 'ACTIVE',
        grounding: 'GENERAL_AI',
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        references: [],
      } as never);

    const recommendation = await service.createDirect(
      {
        ingredients: ['애호박', '계란'],
        conditions: '반찬 추천 부탁드려요',
      },
      1,
    );

    expect(prismaService.aiRecipeRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          missingIngredients: [],
        }),
      }),
    );
    expect(recommendation.missingIngredients).toEqual([]);
  });

  it('should calculate missing ingredients from used ingredients', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([]);
    jest.spyOn(embeddingService, 'embed').mockResolvedValue({
      model: 'local-hash-v1',
      embedding: [1, 0, 0],
    });
    jest.spyOn(recipeLlmService, 'createRecommendation').mockResolvedValue({
      menuName: '애호박 양파 계란 볶음',
      reason: '애호박과 계란에 양파를 더해 단맛을 살립니다.',
      availableIngredients: ['애호박', '계란'],
      usedIngredients: ['애호박', '계란', '양파'],
      missingIngredients: [],
      estimatedCookingTime: 15,
      difficulty: '쉬움',
      content: '애호박과 양파를 볶다가 계란을 풀어 함께 익힙니다.',
    });
    jest
      .spyOn(prismaService.aiRecipeRecommendation, 'create')
      .mockResolvedValue({
        id: 3,
        postId: null,
        requestedById: 1,
        menuName: '애호박 양파 계란 볶음',
        reason: '애호박과 계란에 양파를 더해 단맛을 살립니다.',
        availableIngredients: ['애호박', '계란'],
        missingIngredients: ['양파'],
        estimatedCookingTime: 15,
        difficulty: '쉬움',
        content: '애호박과 양파를 볶다가 계란을 풀어 함께 익힙니다.',
        thumbnailUrl: null,
        status: 'ACTIVE',
        grounding: 'GENERAL_AI',
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        references: [],
      } as never);

    const recommendation = await service.createDirect(
      {
        ingredients: ['애호박', '계란'],
        conditions: '반찬 추천 부탁드려요',
      },
      1,
    );

    expect(prismaService.aiRecipeRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          missingIngredients: ['양파'],
        }),
      }),
    );
    expect(recommendation.missingIngredients).toEqual(['양파']);
  });

  it('should ignore weakly similar posts and use general AI grounding', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([
      {
        id: 10,
        title: '저녁 메뉴 추천해주세요',
        content: '남은 재료로 간단한 저녁 메뉴를 찾고 있어요.',
        viewCount: 0,
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        updatedAt: new Date('2026-06-13T00:00:00.000Z'),
        postTags: [],
        comments: [],
        _count: {
          comments: 0,
        },
      },
    ] as never);
    jest.spyOn(embeddingService, 'embed').mockResolvedValue({
      model: 'local-hash-v1',
      embedding: [1, 0, 0],
    });
    jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([
      {
        postId: 10,
        similarity: 0.72,
      },
    ] as never);
    jest.spyOn(recipeLlmService, 'createRecommendation').mockResolvedValue({
      menuName: '퀴노아 할루미 샐러드',
      reason: '현재 입력과 일반 요리 지식을 기준으로 추천합니다.',
      availableIngredients: ['퀴노아', '할루미'],
      missingIngredients: [],
      estimatedCookingTime: 20,
      difficulty: '쉬움',
      content: '퀴노아와 할루미를 활용해 지중해식 샐러드를 만듭니다.',
    });
    jest
      .spyOn(prismaService.aiRecipeRecommendation, 'create')
      .mockResolvedValue({
        id: 2,
        postId: null,
        requestedById: 1,
        menuName: '퀴노아 할루미 샐러드',
        reason: '현재 입력과 일반 요리 지식을 기준으로 추천합니다.',
        availableIngredients: ['퀴노아', '할루미'],
        missingIngredients: [],
        estimatedCookingTime: 20,
        difficulty: '쉬움',
        content: '퀴노아와 할루미를 활용해 지중해식 샐러드를 만듭니다.',
        status: 'ACTIVE',
        grounding: 'GENERAL_AI',
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        references: [],
      } as never);

    const recommendation = await service.createDirect(
      {
        ingredients: ['퀴노아', '할루미'],
        conditions: '지중해식 느낌',
      },
      1,
    );

    expect(recipeLlmService.createRecommendation).toHaveBeenCalledWith(
      expect.any(Object),
      [],
      'GENERAL_AI',
      null,
      'BALANCED',
    );
    expect(prismaService.aiRecipeRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grounding: 'GENERAL_AI',
          references: {
            create: [],
          },
        }),
      }),
    );
    expect(recommendation.grounding).toBe('GENERAL_AI');
  });

  it('should ignore question-only posts even when ingredients overlap', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([
      {
        id: 10,
        title: '병아리콩 샐러드 어떻게 만들까요?',
        content: '병아리콩, 토마토, 치즈가 있는데 뭘 만들면 좋을까요?',
        viewCount: 0,
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        updatedAt: new Date('2026-06-13T00:00:00.000Z'),
        postTags: [],
        comments: [],
        _count: {
          comments: 0,
        },
      },
    ] as never);
    jest.spyOn(embeddingService, 'embed').mockResolvedValue({
      model: 'local-hash-v1',
      embedding: [1, 0, 0],
    });
    jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([
      {
        postId: 10,
        similarity: 0.82,
      },
    ] as never);
    jest.spyOn(recipeLlmService, 'createRecommendation').mockResolvedValue({
      menuName: '아보카도 병아리콩 샐러드',
      reason: '현재 입력과 일반 요리 지식을 기준으로 추천합니다.',
      availableIngredients: ['아보카도', '병아리콩'],
      missingIngredients: [],
      estimatedCookingTime: 15,
      difficulty: '쉬움',
      content: '아보카도와 병아리콩을 섞어 간단히 만듭니다.',
    });
    jest
      .spyOn(prismaService.aiRecipeRecommendation, 'create')
      .mockResolvedValue({
        id: 3,
        postId: null,
        requestedById: 1,
        menuName: '아보카도 병아리콩 샐러드',
        reason: '현재 입력과 일반 요리 지식을 기준으로 추천합니다.',
        availableIngredients: ['아보카도', '병아리콩'],
        missingIngredients: [],
        estimatedCookingTime: 15,
        difficulty: '쉬움',
        content: '아보카도와 병아리콩을 섞어 간단히 만듭니다.',
        status: 'ACTIVE',
        grounding: 'GENERAL_AI',
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        references: [],
      } as never);

    const recommendation = await service.createDirect(
      {
        ingredients: ['아보카도', '병아리콩'],
        conditions: '가볍게 먹고 싶어요',
      },
      1,
    );

    expect(recipeLlmService.createRecommendation).toHaveBeenCalledWith(
      expect.any(Object),
      [],
      'GENERAL_AI',
      null,
      'BALANCED',
    );
    expect(recommendation.grounding).toBe('GENERAL_AI');
  });

  it('should use community evidence only when comments, semantic similarity, and ingredient overlap pass', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([
      {
        id: 10,
        title: '병아리콩 샐러드 만들기',
        content:
          '병아리콩, 토마토, 치즈, 올리브오일로 가볍게 먹는 샐러드를 만들었어요.',
        viewCount: 0,
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        updatedAt: new Date('2026-06-13T00:00:00.000Z'),
        postTags: [],
        comments: [
          {
            content:
              '병아리콩은 레몬, 올리브오일, 토마토, 치즈를 더하면 샐러드처럼 먹기 좋아요.',
          },
        ],
        _count: {
          comments: 1,
        },
      },
    ] as never);
    jest.spyOn(embeddingService, 'embed').mockResolvedValue({
      model: 'local-hash-v1',
      embedding: [1, 0, 0],
    });
    jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([
      {
        postId: 10,
        similarity: 0.72,
      },
    ] as never);
    jest.spyOn(recipeLlmService, 'createRecommendation').mockResolvedValue({
      menuName: '아보카도 병아리콩 샐러드',
      reason: '병아리콩이 겹치는 커뮤니티 글을 참고했습니다.',
      availableIngredients: ['아보카도', '병아리콩'],
      missingIngredients: ['토마토', '치즈'],
      estimatedCookingTime: 15,
      difficulty: '쉬움',
      content: '아보카도와 병아리콩을 섞고 토마토와 치즈를 더하면 좋습니다.',
    });
    jest
      .spyOn(prismaService.aiRecipeRecommendation, 'create')
      .mockResolvedValue({
        id: 3,
        postId: null,
        requestedById: 1,
        menuName: '아보카도 병아리콩 샐러드',
        reason: '병아리콩이 겹치는 커뮤니티 글을 참고했습니다.',
        availableIngredients: ['아보카도', '병아리콩'],
        missingIngredients: ['토마토', '치즈'],
        estimatedCookingTime: 15,
        difficulty: '쉬움',
        content: '아보카도와 병아리콩을 섞고 토마토와 치즈를 더하면 좋습니다.',
        status: 'ACTIVE',
        grounding: 'COMMUNITY_RAG',
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        references: [
          {
            postId: 10,
            similarity: 0.72,
            rank: 1,
            post: {
              id: 10,
              title: '병아리콩 샐러드 만들기',
              postTags: [],
            },
          },
        ],
      } as never);

    const recommendation = await service.createDirect(
      {
        ingredients: ['아보카도', '병아리콩', '그릭요거트'],
        conditions: '가볍게 먹고 싶어요',
      },
      1,
    );

    expect(recipeLlmService.createRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        availableIngredients: expect.arrayContaining([
          '아보카도',
          '병아리콩',
          '그릭요거트',
        ]),
      }),
      [
        expect.objectContaining({
          title: '병아리콩 샐러드 만들기',
          summary:
            '병아리콩은 레몬, 올리브오일, 토마토, 치즈를 더하면 샐러드처럼 먹기 좋아요.',
          questionSummary:
            '병아리콩, 토마토, 치즈, 올리브오일로 가볍게 먹는 샐러드를 만들었어요.',
          commentEvidence: [
            '병아리콩은 레몬, 올리브오일, 토마토, 치즈를 더하면 샐러드처럼 먹기 좋아요.',
          ],
          similarity: 0.72,
          matchedIngredients: ['병아리콩'],
          missingIngredients: expect.arrayContaining(['토마토', '치즈']),
        }),
      ],
      'COMMUNITY_RAG',
      null,
      'BALANCED',
    );
    expect(prismaService.aiRecipeRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grounding: 'COMMUNITY_RAG',
          references: {
            create: [
              expect.objectContaining({
                postId: 10,
                similarity: 0.72,
                rank: 1,
              }),
            ],
          },
        }),
      }),
    );
    expect(recommendation.grounding).toBe('COMMUNITY_RAG');
    expect(recommendation.missingIngredients).toEqual(['토마토', '치즈']);
  });

  it('should infer uncataloged ingredients from post text for RAG overlap', async () => {
    jest.spyOn(prismaService.post, 'findUnique').mockResolvedValue({
      id: 1,
      title: '명란 크래미 메뉴 추천 부탁드려요',
      content: '집에 명란이랑 크래미가 있어요. 간단하게 먹고 싶어요.',
      viewCount: 0,
      createdAt: new Date('2026-06-13T00:00:00.000Z'),
      updatedAt: new Date('2026-06-13T00:00:00.000Z'),
      postTags: [],
      comments: [],
      _count: {
        comments: 0,
      },
    } as never);
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([
      {
        id: 10,
        title: '명란 크래미 주먹밥 후기',
        content:
          '명란, 크래미, 밥으로 주먹밥 만들었어요. 계란, 참기름을 더하면 퇴근 후 10분 안에 먹을 수 있어요.',
        viewCount: 0,
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        updatedAt: new Date('2026-06-13T00:00:00.000Z'),
        postTags: [],
        comments: [
          {
            content: '명란과 크래미 조합이면 밥만 더해서 주먹밥으로 먹기 좋아요.',
          },
        ],
        _count: {
          comments: 1,
        },
      },
    ] as never);
    jest.spyOn(embeddingService, 'embed').mockResolvedValue({
      model: 'local-hash-v1',
      embedding: [1, 0, 0],
    });
    jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([
      {
        postId: 10,
        similarity: 0.72,
      },
    ] as never);
    jest.spyOn(recipeLlmService, 'createRecommendation').mockResolvedValue({
      menuName: '명란 크래미 주먹밥',
      reason: '비슷한 커뮤니티 글을 참고했습니다.',
      availableIngredients: ['명란', '크래미'],
      missingIngredients: [],
      estimatedCookingTime: 10,
      difficulty: '쉬움',
      content: '명란과 크래미를 밥에 섞어 한입 크기로 뭉쳐주세요.',
    });
    jest
      .spyOn(prismaService.aiRecipeRecommendation, 'create')
      .mockResolvedValue({
        id: 4,
        postId: 1,
        requestedById: 1,
        menuName: '명란 크래미 주먹밥',
        reason: '비슷한 커뮤니티 글을 참고했습니다.',
        availableIngredients: ['명란', '크래미'],
        missingIngredients: ['밥'],
        estimatedCookingTime: 10,
        difficulty: '쉬움',
        content: '명란과 크래미를 밥에 섞어 한입 크기로 뭉쳐주세요.',
        thumbnailUrl: null,
        status: 'ACTIVE',
        grounding: 'COMMUNITY_RAG',
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        references: [
          {
            postId: 10,
            similarity: 0.72,
            rank: 1,
            post: {
              id: 10,
              title: '명란 크래미 주먹밥 후기',
              postTags: [],
            },
          },
        ],
      } as never);

    const recommendation = await service.create(1, 1);

    expect(recipeLlmService.createRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        availableIngredients: expect.arrayContaining(['명란', '크래미']),
      }),
      [
        expect.objectContaining({
          title: '명란 크래미 주먹밥 후기',
          matchedIngredients: expect.arrayContaining(['명란', '크래미']),
          missingIngredients: expect.arrayContaining(['계란', '밥', '참기름']),
        }),
      ],
      'COMMUNITY_RAG',
      null,
      'BALANCED',
    );
    expect(prismaService.aiRecipeRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          availableIngredients: expect.arrayContaining(['명란', '크래미']),
          missingIngredients: ['밥'],
          grounding: 'COMMUNITY_RAG',
        }),
      }),
    );
    expect(recommendation.grounding).toBe('COMMUNITY_RAG');
    expect(recommendation.missingIngredients).toEqual(['밥']);
    expect(recommendation.missingIngredients).not.toEqual(
      expect.arrayContaining(['계란', '참기름', '퇴근', '안에']),
    );
  });

  it('should preserve RAG missing ingredients when the model omits them', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([
      {
        id: 10,
        title: '병아리콩 샐러드 만들기',
        content:
          '병아리콩, 토마토, 치즈, 올리브오일로 가볍게 먹는 샐러드를 만들었어요.',
        viewCount: 0,
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        updatedAt: new Date('2026-06-13T00:00:00.000Z'),
        postTags: [],
        comments: [
          {
            content:
              '병아리콩은 레몬, 올리브오일, 토마토, 치즈를 더하면 샐러드처럼 먹기 좋아요.',
          },
        ],
        _count: {
          comments: 1,
        },
      },
    ] as never);
    jest.spyOn(embeddingService, 'embed').mockResolvedValue({
      model: 'local-hash-v1',
      embedding: [1, 0, 0],
    });
    jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([
      {
        postId: 10,
        similarity: 0.72,
      },
    ] as never);
    jest.spyOn(recipeLlmService, 'createRecommendation').mockResolvedValue({
      menuName: '아보카도 병아리콩 샐러드',
      reason: '병아리콩이 겹치는 커뮤니티 글을 참고했습니다.',
      availableIngredients: ['아보카도', '병아리콩'],
      missingIngredients: [],
      estimatedCookingTime: 15,
      difficulty: '쉬움',
      content: '아보카도와 병아리콩에 토마토와 치즈를 더해 샐러드를 만듭니다.',
    });
    jest
      .spyOn(prismaService.aiRecipeRecommendation, 'create')
      .mockResolvedValue({
        id: 6,
        postId: null,
        requestedById: 1,
        menuName: '아보카도 병아리콩 샐러드',
        reason: '병아리콩이 겹치는 커뮤니티 글을 참고했습니다.',
        availableIngredients: ['아보카도', '병아리콩'],
        missingIngredients: ['토마토', '치즈'],
        estimatedCookingTime: 15,
        difficulty: '쉬움',
        content: '아보카도와 병아리콩을 섞어 샐러드를 만듭니다.',
        status: 'ACTIVE',
        grounding: 'COMMUNITY_RAG',
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        references: [],
      } as never);

    const recommendation = await service.createDirect(
      {
        ingredients: ['아보카도', '병아리콩', '그릭요거트'],
        conditions: '가볍게 먹고 싶어요',
      },
      1,
    );

    expect(prismaService.aiRecipeRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          missingIngredients: expect.arrayContaining(['토마토', '치즈']),
        }),
      }),
    );
    expect(recommendation.missingIngredients).toEqual(
      expect.arrayContaining(['토마토', '치즈']),
    );
  });

  it('should pass usable nutrition metadata to recipe generation', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([]);
    jest.spyOn(embeddingService, 'embed').mockResolvedValue({
      model: 'local-hash-v1',
      embedding: [1, 0, 0],
    });
    jest
      .spyOn(foodMetadataService, 'analyzeIngredientsNutrition')
      .mockResolvedValue({
        ...emptyNutritionMetadata,
        originalInputs: ['계란'],
        normalizedInputs: ['계란'],
        ingredients: [
          {
            originalInput: '계란',
            normalizedInput: '계란',
            matchedName: '계란',
            servingSize: '100g',
            nutrition: {
              energyKcal: 136,
              carbohydrateG: 1,
              proteinG: 12,
              fatG: 9,
              sugarG: null,
              sodiumMg: 130,
            },
            matchStatus: 'exact',
            dataSource: 'test',
            raw: null,
          },
        ],
        totals: {
          energyKcal: 136,
          carbohydrateG: 1,
          proteinG: 12,
          fatG: 9,
          sugarG: null,
          sodiumMg: 130,
        },
        perIngredientAverage: {
          energyKcal: 136,
          carbohydrateG: 1,
          proteinG: 12,
          fatG: 9,
          sugarG: null,
          sodiumMg: 130,
        },
        matchStatus: 'exact',
      });
    jest.spyOn(recipeLlmService, 'createRecommendation').mockResolvedValue({
      menuName: '계란 볶음밥',
      reason: '계란 단백질을 참고했습니다.',
      availableIngredients: ['계란'],
      missingIngredients: [],
      estimatedCookingTime: 10,
      difficulty: '쉬움',
      content: '계란을 볶아 밥과 섞어주세요.',
    });
    jest
      .spyOn(prismaService.aiRecipeRecommendation, 'create')
      .mockResolvedValue({
        id: 4,
        postId: null,
        requestedById: 1,
        menuName: '계란 볶음밥',
        reason: '계란 단백질을 참고했습니다.',
        availableIngredients: ['계란'],
        missingIngredients: [],
        estimatedCookingTime: 10,
        difficulty: '쉬움',
        content: '계란을 볶아 밥과 섞어주세요.',
        status: 'ACTIVE',
        grounding: 'GENERAL_AI',
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        references: [],
      } as never);

    await service.createDirect(
      {
        ingredients: ['계란'],
      },
      1,
    );

    expect(recipeLlmService.createRecommendation).toHaveBeenCalledWith(
      expect.any(Object),
      [],
      'GENERAL_AI',
      expect.objectContaining({
        ingredients: [
          expect.objectContaining({
            matchedName: '계란',
          }),
        ],
      }),
      'BALANCED',
    );
  });

  it('should pass the selected nutrition goal to recipe generation', async () => {
    jest.spyOn(prismaService.post, 'findMany').mockResolvedValue([]);
    jest.spyOn(embeddingService, 'embed').mockResolvedValue({
      model: 'local-hash-v1',
      embedding: [1, 0, 0],
    });
    jest.spyOn(recipeLlmService, 'createRecommendation').mockResolvedValue({
      menuName: '두부 계란 한 접시',
      reason: '고단백 목표를 반영했습니다.',
      availableIngredients: ['두부', '계란'],
      missingIngredients: [],
      estimatedCookingTime: 12,
      difficulty: '쉬움',
      content: '두부와 계란을 함께 익혀주세요.',
    });
    jest
      .spyOn(prismaService.aiRecipeRecommendation, 'create')
      .mockResolvedValue({
        id: 5,
        postId: null,
        requestedById: 1,
        menuName: '두부 계란 한 접시',
        reason: '고단백 목표를 반영했습니다.',
        availableIngredients: ['두부', '계란'],
        missingIngredients: [],
        estimatedCookingTime: 12,
        difficulty: '쉬움',
        content: '두부와 계란을 함께 익혀주세요.',
        status: 'ACTIVE',
        grounding: 'GENERAL_AI',
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        references: [],
      } as never);

    await service.createDirect(
      {
        ingredients: ['두부', '계란'],
        nutritionGoal: 'HIGH_PROTEIN',
      },
      1,
    );

    expect(recipeLlmService.createRecommendation).toHaveBeenCalledWith(
      expect.any(Object),
      [],
      'GENERAL_AI',
      null,
      'HIGH_PROTEIN',
    );
  });
});
