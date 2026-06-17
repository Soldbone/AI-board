import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('posts/:postId/comments')
  findComments(@Param('postId') postId: string) {
    return this.commentsService.findComments(postId);
  }

  @Post('posts/:postId/comments')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    return this.commentsService.createComment(user, postId, createCommentDto);
  }

  @Post('comments/:commentId/replies')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  createReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
    @Body() createReplyDto: CreateReplyDto,
  ) {
    return this.commentsService.createReply(user, commentId, createReplyDto);
  }

  @Patch('comments/:commentId')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
    @Body() updateCommentDto: UpdateCommentDto,
  ) {
    return this.commentsService.updateComment(user, commentId, updateCommentDto);
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  deleteComment(@CurrentUser() user: AuthenticatedUser, @Param('commentId') commentId: string) {
    return this.commentsService.deleteComment(user, commentId);
  }
}
