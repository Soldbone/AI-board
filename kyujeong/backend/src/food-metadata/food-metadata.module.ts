import { Module } from '@nestjs/common';
import { FoodMetadataController } from './food-metadata.controller';
import { FoodMetadataService } from './food-metadata.service';
import { CompositeFoodDataClient } from './composite-food-data.client';
import { PublicDataFoodNutritionClient } from './public-data-food-nutrition.client';
import { RawMaterialNutritionClient } from './raw-material-nutrition.client';
import { StandardFoodCompositionClient } from './standard-food-composition.client';

@Module({
  controllers: [FoodMetadataController],
  providers: [
    FoodMetadataService,
    {
      provide: 'FOOD_DATA_CLIENT',
      useFactory: () =>
        new CompositeFoodDataClient(
          new RawMaterialNutritionClient(),
          new CompositeFoodDataClient(
            new StandardFoodCompositionClient(),
            new PublicDataFoodNutritionClient(),
          ),
        ),
    },
  ],
  exports: [FoodMetadataService],
})
export class FoodMetadataModule {}
