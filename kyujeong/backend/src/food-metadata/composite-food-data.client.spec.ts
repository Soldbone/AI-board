import { CompositeFoodDataClient } from './composite-food-data.client';
import { FoodDataClient, FoodSearchResult } from './food-metadata.types';

const createResult = (
  source: string,
  matchedName: string,
  matchStatus: 'matched' | 'candidate' | 'not_found' | 'configuration_missing',
): FoodSearchResult => ({
  originalInput: '계란',
  normalizedInput: '계란',
  candidates:
    matchStatus === 'not_found' || matchStatus === 'configuration_missing'
      ? []
      : [
          {
            id: `${source}-1`,
            originalName: '계란',
            matchedName,
            normalizedName: matchedName,
            servingSize: '100g',
            nutrition: {
              energyKcal: 143,
              carbohydrateG: 0.7,
              proteinG: 12.6,
              fatG: 9.5,
              sugarG: 0.4,
              sodiumMg: 142,
            },
            source,
            matchStatus,
          },
        ],
  totalCount: matchStatus === 'not_found' ? 0 : 1,
  source,
  matchStatus,
  message: null,
});

describe('CompositeFoodDataClient', () => {
  it('uses the standard food composition result first when available', async () => {
    const primary: FoodDataClient = {
      search: jest.fn().mockResolvedValue(createResult('standard', '계란', 'matched')),
    };
    const fallback: FoodDataClient = {
      search: jest
        .fn()
        .mockResolvedValue(createResult('fallback', '볶음밥_계란', 'candidate')),
    };
    const client = new CompositeFoodDataClient(primary, fallback);

    const result = await client.search({ query: '계란' });

    expect(result.candidates[0].matchedName).toBe('계란');
    expect(fallback.search).not.toHaveBeenCalled();
  });

  it('falls back to the food nutrition API when the standard source is empty', async () => {
    const primary: FoodDataClient = {
      search: jest
        .fn()
        .mockResolvedValue(createResult('standard', '', 'configuration_missing')),
    };
    const fallback: FoodDataClient = {
      search: jest.fn().mockResolvedValue(createResult('fallback', '두부', 'matched')),
    };
    const client = new CompositeFoodDataClient(primary, fallback);

    const result = await client.search({ query: '두부' });

    expect(result.candidates[0].matchedName).toBe('두부');
    expect(fallback.search).toHaveBeenCalledWith({ query: '두부' });
  });
});
