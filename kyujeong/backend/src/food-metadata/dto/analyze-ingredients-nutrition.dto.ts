import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class AnalyzeIngredientsNutritionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  ingredients: string[];
}
