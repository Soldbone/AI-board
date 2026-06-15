import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CreateAgentRunDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  question: string;
}
