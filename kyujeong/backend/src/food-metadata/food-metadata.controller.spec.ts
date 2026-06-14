import { Test, TestingModule } from '@nestjs/testing';
import { FoodMetadataController } from './food-metadata.controller';
import { FoodMetadataService } from './food-metadata.service';

describe('FoodMetadataController', () => {
  let controller: FoodMetadataController;
  let service: {
    searchFoodItems: jest.Mock;
    getFoodNutrition: jest.Mock;
    analyzeIngredientsNutrition: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      searchFoodItems: jest.fn(),
      getFoodNutrition: jest.fn(),
      analyzeIngredientsNutrition: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FoodMetadataController],
      providers: [
        {
          provide: FoodMetadataService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<FoodMetadataController>(FoodMetadataController);
  });

  it('searches food item candidates', async () => {
    service.searchFoodItems.mockResolvedValue({ candidates: [] });

    await controller.searchFoodItems('계란', 5);

    expect(service.searchFoodItems).toHaveBeenCalledWith('계란', 5);
  });

  it('gets one food nutrition record', async () => {
    service.getFoodNutrition.mockResolvedValue({ item: null });

    await controller.getFoodNutrition('두부', 'food-1');

    expect(service.getFoodNutrition).toHaveBeenCalledWith('두부', 'food-1');
  });

  it('analyzes multiple ingredients', async () => {
    service.analyzeIngredientsNutrition.mockResolvedValue({ ingredients: [] });

    await controller.analyzeIngredientsNutrition({
      ingredients: ['계란', '대파'],
    });

    expect(service.analyzeIngredientsNutrition).toHaveBeenCalledWith([
      '계란',
      '대파',
    ]);
  });
});
