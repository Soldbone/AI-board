import { StandardFoodCompositionClient } from './standard-food-composition.client';

describe('StandardFoodCompositionClient', () => {
  it('returns configuration_missing until the key and URL are configured', async () => {
    const client = new StandardFoodCompositionClient({
      apiKey: '',
      apiUrl: '',
      fetchImpl: jest.fn(),
    });

    const result = await client.search({ query: '계란' });

    expect(result.matchStatus).toBe('configuration_missing');
    expect(result.candidates).toEqual([]);
  });

  it('looks up a food code from group lists and parses detail nutrients', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          header: {
            result_Code: '00',
            result_Msg: 'NORMAL SERVICE.',
          },
          body: {
            total_Count: '1',
            items: {
              item: [
                {
                  food_Code: 'R001',
                  food_Group: '난류',
                  food_Nm: '계란',
                  origin_Nm: '국산',
                  examin_Year: '2024',
                },
              ],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          body: {
            items: {
              item: {
                food_Code: 'R001',
                food_Group: '난류',
                food_Nm: '계란',
                origin_Nm: '국산',
                examin_Year: '2024',
                irdnt: {
                  irdntCtket: [
                    {
                      irdnt_Nm: '에너지',
                      irdnt_Unit_Nm: 'kcal',
                      cont_Info: '143',
                    },
                    {
                      irdnt_Nm: '탄수화물',
                      irdnt_Unit_Nm: 'g',
                      cont_Info: '0.7',
                    },
                    {
                      irdnt_Nm: '단백질',
                      irdnt_Unit_Nm: 'g',
                      cont_Info: '12.6',
                    },
                    {
                      irdnt_Nm: '지방',
                      irdnt_Unit_Nm: 'g',
                      cont_Info: '9.5',
                    },
                    {
                      irdnt_Nm: '나트륨',
                      irdnt_Unit_Nm: 'mg',
                      cont_Info: '142',
                    },
                  ],
                },
              },
            },
          },
        }),
      });
    const client = new StandardFoodCompositionClient({
      apiKey: 'test-key',
      apiUrl: 'https://example.test/standard-food',
      groupIds: ['J'],
      pageSize: 50,
      maxPagesPerGroup: 1,
      fetchImpl,
    });

    const result = await client.search({ query: '계란' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('fd_Grupp=J');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('page_No=1');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('Page_Size=50');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('food_Code=R001');
    expect(result.candidates[0]).toMatchObject({
      id: 'R001',
      matchedName: '계란',
      servingSize: '100g',
      nutrition: {
        energyKcal: 143,
        carbohydrateG: 0.7,
        proteinG: 12.6,
        fatG: 9.5,
        sodiumMg: 142,
      },
    });
  });
});
