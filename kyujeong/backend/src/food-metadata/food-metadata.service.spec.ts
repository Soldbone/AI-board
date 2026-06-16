import { FoodMetadataService } from './food-metadata.service';
import { FoodDataClient, FoodSearchResult } from './food-metadata.types';

const createSearchResult = (
  query: string,
  matchedName = query,
): FoodSearchResult => ({
  originalInput: query,
  normalizedInput: query,
  candidates: [
    {
      id: `food-${query}`,
      originalName: query,
      matchedName,
      normalizedName: matchedName,
      servingSize: '100g',
      nutrition: {
        energyKcal: 100,
        carbohydrateG: 10,
        proteinG: 5,
        fatG: 2,
        sugarG: 1,
        sodiumMg: 20,
      },
      source: 'test',
      matchStatus: 'matched',
    },
  ],
  totalCount: 1,
  source: 'test',
  matchStatus: 'matched',
  message: null,
});

describe('FoodMetadataService', () => {
  it('searches with normalized Korean food aliases', async () => {
    const searchMock = jest.fn().mockResolvedValue(createSearchResult('계란'));
    const client: FoodDataClient = {
      search: searchMock,
    };
    const service = new FoodMetadataService(client);

    const result = await service.searchFoodItems('달걀');

    expect(searchMock).toHaveBeenCalledWith({ query: '계란', limit: 10 });
    expect(result.originalInput).toBe('달걀');
    expect(result.normalizedInput).toBe('계란');
    expect(result.candidates[0].matchedName).toBe('계란');
  });

  it('returns a structured nutrition item', async () => {
    const client: FoodDataClient = {
      search: jest.fn().mockResolvedValue(createSearchResult('두부')),
    };
    const service = new FoodMetadataService(client);

    const result = await service.getFoodNutrition('두부');

    expect(result.item?.nutrition.proteinG).toBe(5);
    expect(result.matchStatus).toBe('matched');
  });

  it('does not fall back to the first candidate when foodId is missing', async () => {
    const client: FoodDataClient = {
      search: jest.fn().mockResolvedValue(createSearchResult('두부')),
    };
    const service = new FoodMetadataService(client);

    const result = await service.getFoodNutrition('두부', 'missing-food-id');

    expect(result.item).toBeNull();
    expect(result.matchStatus).toBe('not_found');
    expect(result.message).toBe(
      'No food candidate matched foodId: missing-food-id.',
    );
  });

  it('summarizes multiple ingredient nutrition metadata', async () => {
    const client: FoodDataClient = {
      search: jest
        .fn()
        .mockResolvedValueOnce(createSearchResult('계란'))
        .mockResolvedValueOnce(createSearchResult('두부')),
    };
    const service = new FoodMetadataService(client);

    const result = await service.analyzeIngredientsNutrition(['계란', '두부']);

    expect(result.totals.energyKcal).toBe(200);
    expect(result.perIngredientAverage.proteinG).toBe(5);
    expect(result.notes).toContain(
      'This metadata is factual support only; community RAG remains responsible for final menu judgment.',
    );
  });
});
