import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AiRecommendationsService } from './ai-recommendations.service';
import { EmbeddingService } from './embedding.service';
import { RecipeLlmService } from './recipe-llm.service';

describe('AiRecommendationsService', () => {
  const originalEnv = process.env;
  let service: AiRecommendationsService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: '',
      OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
      OPENAI_CHAT_MODEL: 'gpt-4o-mini',
      AI_RECOMMENDATION_DAILY_LIMIT: '5',
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
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should report fallback mode when OPENAI_API_KEY is empty', () => {
    expect(service.getStatus()).toEqual({
      mode: 'FALLBACK',
      openAiConfigured: false,
      embeddingModel: 'local-hash-v1',
      chatModel: null,
      dailyLimit: 5,
      pgvectorAvailable: false,
      pgvectorDecision:
        'Current database does not expose the vector extension; use fallback retrieval until DB support is available.',
    });
  });

  it('should report OpenAI mode when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_EMBEDDING_MODEL = 'custom-embedding';
    process.env.OPENAI_CHAT_MODEL = 'custom-chat';

    expect(service.getStatus()).toMatchObject({
      mode: 'OPENAI',
      openAiConfigured: true,
      embeddingModel: 'custom-embedding',
      chatModel: 'custom-chat',
    });
  });

  it('should block recommendation creation when the daily limit is reached', async () => {
    jest
      .spyOn(prismaService.aiRecipeRecommendation, 'count')
      .mockResolvedValue(5);

    try {
      await service.createDirect(
        {
          ingredients: ['계란', '김치'],
          conditions: '10분 안에',
        },
        1,
      );
      fail('Expected daily limit error');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect((error as HttpException).getResponse()).toBe(
        'AI recommendation daily limit exceeded',
      );
    }
  });
});
