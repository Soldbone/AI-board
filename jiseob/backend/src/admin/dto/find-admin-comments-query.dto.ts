import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ModerationStatus } from '../../common/enums/comment-status.enum';

export class FindAdminCommentsQueryDto {
  @IsOptional()
  @IsIn([ModerationStatus.NEEDS_REVIEW])
  moderationStatus?: ModerationStatus = ModerationStatus.NEEDS_REVIEW;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
