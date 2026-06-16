import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AnalyzeIngredientsNutritionDto } from './dto/analyze-ingredients-nutrition.dto';
import { FoodMetadataService } from './food-metadata.service';

@Controller(['food-metadata', 'api/food-metadata'])
export class FoodMetadataController {
  constructor(private readonly foodMetadataService: FoodMetadataService) {}

  @Get('search')
  searchFoodItems(
    @Query('query') query: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.foodMetadataService.searchFoodItems(query, limit);
  }

  @Get('nutrition')
  getFoodNutrition(
    @Query('query') query: string,
    @Query('foodId') foodId?: string,
  ) {
    return this.foodMetadataService.getFoodNutrition(query, foodId);
  }

  @Post('analyze')
  analyzeIngredientsNutrition(
    @Body() analyzeIngredientsNutritionDto: AnalyzeIngredientsNutritionDto,
  ) {
    return this.foodMetadataService.analyzeIngredientsNutrition(
      analyzeIngredientsNutritionDto.ingredients,
    );
  }
}
