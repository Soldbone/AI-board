import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AssistPostDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  additionalRequest?: string;
}
