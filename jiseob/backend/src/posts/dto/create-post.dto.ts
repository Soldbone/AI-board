import { ArrayMaxSize, IsArray, IsOptional, IsString, Length } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @Length(1, 200)
  title: string;

  @IsString()
  @Length(1, 10000)
  content: string;

  @IsString()
  @Length(1, 2048)
  youtubeUrl: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  tags?: string[];
}
