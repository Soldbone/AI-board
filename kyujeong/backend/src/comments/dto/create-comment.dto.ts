import { IsNotEmpty, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsNotEmpty()
  @MaxLength(500)
  content!: string;
}
