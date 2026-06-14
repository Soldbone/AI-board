import { Module } from '@nestjs/common';
import { FoodMetadataController } from './food-metadata.controller';
import { FoodMetadataService } from './food-metadata.service';
import { PublicDataFoodNutritionClient } from './public-data-food-nutrition.client';

@Module({
  controllers: [FoodMetadataController],
  providers: [
    FoodMetadataService,
    {
      provide: 'FOOD_DATA_CLIENT',
      useFactory: () => new PublicDataFoodNutritionClient(),
    },
  ],
  exports: [FoodMetadataService],
})
export class FoodMetadataModule {}
