import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AI_RECOMMENDATION_GOALS } from '../recommendation-goal';

export class CreateRecommendationDto {
  @IsOptional()
  @IsIn(AI_RECOMMENDATION_GOALS)
  nutritionGoal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  additionalRequest?: string;
}
