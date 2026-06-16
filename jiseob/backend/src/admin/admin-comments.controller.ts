import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminCommentsService } from './admin-comments.service';
import { FindAdminCommentsQueryDto } from './dto/find-admin-comments-query.dto';

@Controller('admin/comments')
export class AdminCommentsController {
  constructor(private readonly adminCommentsService: AdminCommentsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  findReviewComments(@Query() query: FindAdminCommentsQueryDto) {
    return this.adminCommentsService.findReviewComments(query);
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
  deleteComment(@Param('commentId') commentId: string) {
    return this.adminCommentsService.deleteComment(commentId);
  }

  @Post(':commentId/analysis/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
  retryCommentAnalysis(@Param('commentId') commentId: string) {
    return this.adminCommentsService.retryCommentAnalysis(commentId);
  }
}
