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
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreatePostDto } from './dto/create-post.dto';
import { FindPostsQueryDto } from './dto/find-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  findPosts(@Query() query: FindPostsQueryDto) {
    return this.postsService.findPosts(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard, CsrfGuard)
  createPost(@CurrentUser() user: AuthenticatedUser, @Body() createPostDto: CreatePostDto) {
    return this.postsService.createPost(user, createPostDto);
  }

  @Get(':postId')
  getPost(@Param('postId') postId: string) {
    return this.postsService.getPost(postId);
  }

  @Patch(':postId')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  updatePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Body() updatePostDto: UpdatePostDto,
  ) {
    return this.postsService.updatePost(user, postId, updatePostDto);
  }

  @Delete(':postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  deletePost(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    return this.postsService.deletePost(user, postId);
  }

  @Post(':postId/views')
  @HttpCode(HttpStatus.OK)
  increaseViewCount(@Param('postId') postId: string) {
    return this.postsService.increaseViewCount(postId);
  }

  @Post(':postId/like')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  likePost(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    return this.postsService.likePost(user, postId);
  }

  @Delete(':postId/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  unlikePost(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    return this.postsService.unlikePost(user, postId);
  }
}
