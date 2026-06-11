import { IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateCommentDto {
  @IsNotEmpty()
  @MaxLength(500)
  content!: string;
}
