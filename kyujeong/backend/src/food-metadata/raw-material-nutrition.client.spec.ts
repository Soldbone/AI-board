import { RawMaterialNutritionClient } from './raw-material-nutrition.client';

describe('RawMaterialNutritionClient', () => {
  it('returns configuration_missing until the key is configured', async () => {
    const client = new RawMaterialNutritionClient({
      apiKey: '',
      apiUrl: 'https://example.test/raw-material',
      fetchImpl: jest.fn(),
    });

    const result = await client.search({ query: '양파' });

    expect(result.matchStatus).toBe('configuration_missing');
    expect(result.candidates).toEqual([]);
  });

  it('loads raw-material rows and prefers raw ingredient matches', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        response: {
          header: {
            resultCode: '00',
            resultMsg: 'NORMAL_SERVICE',
          },
          body: {
            totalCount: '3',
            pageNo: '1',
            numOfRows: '1000',
            items: {
              item: [
                {
                  foodCd: 'R-F-001',
                  foodNm: '양파볶음',
                  typeNm: '원재료성 식품',
                  nutConSrtrQua: '100g',
                  enerc: '70',
                  prot: '1.2',
                  fatce: '3.1',
                  chocdf: '9.5',
                  sugar: '4.0',
                  nat: '210',
                },
                {
                  foodCd: 'R-F-002',
                  foodNm: '양파_생것',
                  typeNm: '원재료성 식품',
                  nutConSrtrQua: '100g',
                  enerc: '35',
                  prot: '0.95',
                  fatce: '0.04',
                  chocdf: '7.68',
                  sugar: '4.24',
                  nat: '3',
                },
                {
                  foodCd: 'R-F-003',
                  foodNm: '대파_생것',
                  typeNm: '원재료성 식품',
                  nutConSrtrQua: '100g',
                  enerc: '29',
                },
              ],
            },
          },
        },
      }),
    });
    const client = new RawMaterialNutritionClient({
      apiKey: 'test-key',
      apiUrl: 'https://example.test/raw-material',
      pageSize: 1000,
      maxPages: 1,
      fetchImpl,
    });

    const result = await client.search({ query: '양파' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('pageNo=1');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('numOfRows=1000');
    expect(result.candidates[0]).toMatchObject({
      id: 'R-F-002',
      matchedName: '양파_생것',
      servingSize: '100g',
      source: '전국통합식품영양성분정보(원재료성식품)표준데이터',
      matchStatus: 'matched',
      nutrition: {
        energyKcal: 35,
        proteinG: 0.95,
        fatG: 0.04,
        carbohydrateG: 7.68,
        sugarG: 4.24,
        sodiumMg: 3,
      },
    });
  });
});
