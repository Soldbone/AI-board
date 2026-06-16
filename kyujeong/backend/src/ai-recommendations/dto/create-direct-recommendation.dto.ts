import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AI_RECOMMENDATION_GOALS } from '../recommendation-goal';

export class CreateDirectRecommendationDto {
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(30, { each: true })
  ingredients!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  conditions?: string;

  @IsOptional()
  @IsIn(AI_RECOMMENDATION_GOALS)
  nutritionGoal?: string;
}
