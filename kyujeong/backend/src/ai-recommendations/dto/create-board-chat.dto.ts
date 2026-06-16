import { IsString, MaxLength } from 'class-validator';

export class CreateBoardChatDto {
  @IsString()
  @MaxLength(1000)
  message: string;
}
