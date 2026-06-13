import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AiRecommendationsService } from './ai-recommendations.service';
import { EmbeddingService } from './embedding.service';
import { RecipeLlmService } from './recipe-llm.service';

describe('AiRecommendationsService', () => {
  const originalEnv = process.env;
  let service: AiRecommendationsService;
  let prismaService: PrismaService;
  let embeddingService: EmbeddingService;
  let recipeLlmService: RecipeLlmService;

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
      ],
    }).compile();

    service = module.get<AiRecommendationsService>(AiRecommendationsService);
    prismaService = module.get<PrismaService>(PrismaService);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);
    recipeLlmService = module.get<RecipeLlmService>(RecipeLlmService);
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
      pgvectorDecision:
        'pgvector is installed; vector search is the primary retrieval path.',
    });
  });

  it('should report OpenAI mode when OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_EMBEDDING_MODEL = 'custom-embedding';
    process.env.OPENAI_CHAT_MODEL = 'custom-chat';

    await expect(service.getStatus()).resolves.toMatchObject({
      mode: 'OPENAI',
      openAiConfigured: true,
      embeddingModel: 'custom-embedding',
      chatModel: 'custom-chat',
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
    );
    expect(prismaService.aiRecipeRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grounding: 'GENERAL_AI',
        }),
      }),
    );
    expect(recommendation.grounding).toBe('GENERAL_AI');
    expect(recommendation.referencedPosts).toEqual([]);
  });
});
