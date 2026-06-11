import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';

type AuthenticatedRequest = Request & {
  user: {
    sub: number;
    email: string;
  };
};

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(10), ParseIntPipe) size: number,
  ) {
    return this.postsService.findAll(page, size);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() createPostDto: CreatePostDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.postsService.create(createPostDto, request.user.sub);
  }
}
