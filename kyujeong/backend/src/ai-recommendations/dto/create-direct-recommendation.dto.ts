import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
}
