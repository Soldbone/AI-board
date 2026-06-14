import { Test, TestingModule } from '@nestjs/testing';
import { FoodMetadataService } from '../food-metadata/food-metadata.service';
import { AiAgentService } from './ai-agent.service';
import { PostDraftAgentRunner } from './post-draft-agent.runner';
import { AnalyzeFoodMetadataTool } from './tools/analyze-food-metadata.tool';
import { EvaluatePostSuccessTool } from './tools/evaluate-post-success.tool';
import { ExtractIngredientsTool } from './tools/extract-ingredients.tool';
import { RewritePostDraftTool } from './tools/rewrite-post-draft.tool';

describe('AiAgentService', () => {
  let service: AiAgentService;

  const foodMetadataService = {
    analyzeIngredientsNutrition: jest.fn(),
  };

  beforeEach(async () => {
    foodMetadataService.analyzeIngredientsNutrition.mockResolvedValue({
      originalInputs: ['계란', '김치'],
      normalizedInputs: ['계란', '김치'],
      ingredients: [
        {
          originalInput: '계란',
          normalizedInput: '계란',
          matchedName: '달걀',
          servingSize: '100g',
          nutrition: {
            energyKcal: 136,
            carbohydrateG: 1,
            proteinG: 12,
            fatG: 9,
            sugarG: 0,
            sodiumMg: 130,
          },
          matchStatus: 'matched',
          message: null,
        },
        {
          originalInput: '김치',
          normalizedInput: '김치',
          matchedName: '배추김치',
          servingSize: '100g',
          nutrition: {
            energyKcal: 25,
            carbohydrateG: 4,
            proteinG: 2,
            fatG: 1,
            sugarG: 2,
            sodiumMg: 650,
          },
          matchStatus: 'matched',
          message: null,
        },
      ],
      totals: {
        energyKcal: 161,
        carbohydrateG: 5,
        proteinG: 14,
        fatG: 10,
        sugarG: 2,
        sodiumMg: 780,
      },
      perIngredientAverage: {
        energyKcal: 80.5,
        carbohydrateG: 2.5,
        proteinG: 7,
        fatG: 5,
        sugarG: 1,
        sodiumMg: 390,
      },
      dataSource: '공공데이터포털 식품영양성분 API',
      matchStatus: 'matched',
      notes: [],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAgentService,
        PostDraftAgentRunner,
        ExtractIngredientsTool,
        AnalyzeFoodMetadataTool,
        EvaluatePostSuccessTool,
        RewritePostDraftTool,
        {
          provide: FoodMetadataService,
          useValue: foodMetadataService,
        },
      ],
    }).compile();

    service = module.get<AiAgentService>(AiAgentService);
  });

  it('asks follow-up questions when the draft has too little context', async () => {
    const result = await service.assistPostDraft({
      content: '추천',
    });

    expect(result.status).toBe('needs_input');
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.suggestedTitle).toBeNull();
  });

  it('creates a post draft using food metadata tool evidence', async () => {
    const result = await service.assistPostDraft({
      title: '계란 김치',
      content: '계란, 김치, 양파가 있어요. 10분 안에 저녁으로 매콤하게 먹고 싶어요.',
      additionalRequest: '초보자도 쉬운 메뉴면 좋겠어요',
    });

    expect(result.status).toBe('fallback');
    expect(result.suggestedTitle).toContain('계란');
    expect(result.suggestedBody).toContain('MCP');
    expect(result.successPlan?.score).toBeGreaterThan(0);
    expect(result.successPlan?.expectedComments.length).toBeGreaterThan(0);
    expect(result.ingredients).toContain('계란');
    expect(result.toolCalls.map((toolCall) => toolCall.toolName)).toContain(
      'analyze_food_metadata',
    );
    expect(foodMetadataService.analyzeIngredientsNutrition).toHaveBeenCalled();
  });

  it('reflects attention-grabbing requests without replacing the community post', async () => {
    const result = await service.assistPostDraft({
      title: '계란 김치 밥',
      content: '계란, 김치, 밥이 있어요. 10분 안에 저녁으로 먹고 싶어요.',
      additionalRequest: '어그로 끌리게 게시글 쓰고싶어',
    });

    expect(result.suggestedTitle).toContain('뻔한 메뉴 말고');
    expect(result.suggestedBody).toContain('댓글에서 갈릴 만한');
    expect(result.suggestedBody).toContain('설득해주세요');
  });
});
