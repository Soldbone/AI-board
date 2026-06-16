import { PublicDataFoodNutritionClient } from './public-data-food-nutrition.client';

describe('PublicDataFoodNutritionClient', () => {
  it('returns configuration_missing when the API key is absent', async () => {
    const client = new PublicDataFoodNutritionClient({
      apiKey: '',
      fetchImpl: jest.fn(),
    });

    const result = await client.search({ query: '계란' });

    expect(result.matchStatus).toBe('configuration_missing');
    expect(result.candidates).toEqual([]);
  });

  it('parses public data food nutrition response shapes', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        response: {
          header: {
            resultCode: '00',
            resultMsg: 'NORMAL SERVICE.',
          },
          body: {
            totalCount: 1,
            items: {
              item: [
                {
                  FOOD_CD: 'D0001',
                  FOOD_NM_KR: '계란',
                  SERVING_SIZE: '100g',
                  NUTR_CONT1: '143',
                  NUTR_CONT2: '0.7',
                  NUTR_CONT3: '12.6',
                  NUTR_CONT4: '9.5',
                  NUTR_CONT5: '0.4',
                  NUTR_CONT6: '142',
                },
              ],
            },
          },
        },
      }),
    });
    const client = new PublicDataFoodNutritionClient({
      apiKey: 'test-key',
      apiUrl: 'https://example.test/food',
      fetchImpl,
    });

    const result = await client.search({ query: '계란', limit: 5 });

    expect(fetchImpl).toHaveBeenCalled();
    expect(result.matchStatus).toBe('candidate');
    expect(result.candidates[0]).toMatchObject({
      id: 'D0001',
      matchedName: '계란',
      servingSize: '100g',
      nutrition: {
        energyKcal: 143,
        carbohydrateG: 0.7,
        proteinG: 12.6,
        fatG: 9.5,
        sugarG: 0.4,
        sodiumMg: 142,
      },
    });
  });

  it('parses public data v2 AMT_NUM nutrition fields', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        header: {
          resultCode: '00',
          resultMsg: 'NORMAL SERVICE.',
        },
        body: {
          totalCount: 1,
          items: [
            {
              FOOD_CD: 'D101',
              FOOD_NM_KR: '볶음밥_계란',
              SERVING_SIZE: '100g',
              AMT_NUM1: '225.000',
              AMT_NUM3: '6.62',
              AMT_NUM4: '11.28',
              AMT_NUM6: '24.23',
              AMT_NUM7: '0.17',
              AMT_NUM13: '318.000',
            },
          ],
        },
      }),
    });
    const client = new PublicDataFoodNutritionClient({
      apiKey: 'test-key',
      apiUrl: 'https://example.test/food',
      fetchImpl,
    });

    const result = await client.search({ query: '계란', limit: 5 });

    expect(result.candidates[0]).toMatchObject({
      id: 'D101',
      matchedName: '볶음밥_계란',
      nutrition: {
        energyKcal: 225,
        carbohydrateG: 24.23,
        proteinG: 6.62,
        fatG: 11.28,
        sugarG: 0.17,
        sodiumMg: 318,
      },
    });
  });

  it('returns rate_limited for HTTP 429 responses', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });
    const client = new PublicDataFoodNutritionClient({
      apiKey: 'test-key',
      apiUrl: 'https://example.test/food',
      fetchImpl,
    });

    const result = await client.search({ query: '계란' });

    expect(result.matchStatus).toBe('rate_limited');
    expect(result.message).toBe('Public data API returned HTTP 429.');
  });
});
