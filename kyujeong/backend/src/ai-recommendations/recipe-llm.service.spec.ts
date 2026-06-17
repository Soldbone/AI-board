import { RecipeLlmService } from './recipe-llm.service';

describe('RecipeLlmService', () => {
  const originalEnv = process.env;
  let service: RecipeLlmService;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: '',
    };
    service = new RecipeLlmService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('changes the fallback recipe direction when recommendation goals change', async () => {
    const targetPost = {
      title: '두부랑 버섯으로 고기 없이 먹는 방법',
      content: '두부랑 버섯으로 고기 없이 먹는 방법을 찾고 있어요.',
      tags: ['두부', '버섯'],
      availableIngredients: ['두부', '버섯'],
    };

    const quickRecommendation = await service.createRecommendation(
      targetPost,
      [],
      'GENERAL_AI',
      null,
      ['QUICK'],
    );
    const fillingRecommendation = await service.createRecommendation(
      targetPost,
      [],
      'GENERAL_AI',
      null,
      ['FILLING'],
    );

    expect(quickRecommendation.menuName).toContain('빠르게');
    expect(quickRecommendation.estimatedCookingTime).toBe(10);
    expect(fillingRecommendation.menuName).toContain('든든하게');
    expect(fillingRecommendation.estimatedCookingTime).toBe(15);
    expect(fillingRecommendation.menuName).not.toBe(
      quickRecommendation.menuName,
    );
    expect(fillingRecommendation.content).not.toBe(quickRecommendation.content);
  });

  it('uses an additional request as a fallback recipe constraint', async () => {
    const recommendation = await service.createRecommendation(
      {
        title: '두부랑 버섯으로 고기 없이 먹는 방법',
        content:
          '두부랑 버섯으로 고기 없이 먹는 방법을 찾고 있어요.\n[추가 요청]\n짜지 않게 해주세요',
        tags: ['두부', '버섯'],
        availableIngredients: ['두부', '버섯'],
      },
      [],
      'GENERAL_AI',
      null,
      ['BALANCED'],
    );

    expect(recommendation.menuName).toContain('짜지 않게');
    expect(recommendation.reason).toContain('짜지 않게');
    expect(recommendation.content).toContain('짜지 않게');
  });

  it('reflects free-form additional requests instead of reusing the same fallback recipe', async () => {
    const basePost = {
      title: '두부랑 버섯으로 고기 없이 먹는 방법',
      tags: ['두부', '버섯'],
      availableIngredients: ['두부', '버섯'],
    };
    const mildRecommendation = await service.createRecommendation(
      {
        ...basePost,
        content:
          '두부랑 버섯으로 고기 없이 먹는 방법을 찾고 있어요.\n[추가 요청]\n담백하게 해주세요',
      },
      [],
      'GENERAL_AI',
      null,
      ['BALANCED'],
    );
    const spicyRecommendation = await service.createRecommendation(
      {
        ...basePost,
        content:
          '두부랑 버섯으로 고기 없이 먹는 방법을 찾고 있어요.\n[추가 요청]\n맵고 자극적으로 해주세요',
      },
      [],
      'GENERAL_AI',
      null,
      ['BALANCED'],
    );

    expect(spicyRecommendation.menuName).toContain('맵고 자극적');
    expect(spicyRecommendation.reason).toContain('맵고 자극적');
    expect(spicyRecommendation.content).toContain('맵고 자극적');
    expect(spicyRecommendation.menuName).not.toBe(mildRecommendation.menuName);
  });
});
