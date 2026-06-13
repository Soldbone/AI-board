import {
  Controller,
  Body,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { AiRecommendationsService } from './ai-recommendations.service';
import { CreateDirectRecommendationDto } from './dto/create-direct-recommendation.dto';

type AuthenticatedRequest = Request & {
  user: {
    sub: number;
    email: string;
  };
};

@Controller()
export class AiRecommendationsController {
  constructor(
    private readonly aiRecommendationsService: AiRecommendationsService,
  ) {}

  @Get(['agent/status', 'api/agent/status'])
  getStatus() {
    return this.aiRecommendationsService.getStatus();
  }

  @Get([
    'agent/posts/:postId/recommendation',
    'api/agent/posts/:postId/recommendation',
  ])
  findLatest(@Param('postId', ParseIntPipe) postId: number) {
    return this.aiRecommendationsService.findLatest(postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post([
    'agent/posts/:postId/recommendation',
    'api/agent/posts/:postId/recommendation',
  ])
  create(
    @Param('postId', ParseIntPipe) postId: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.aiRecommendationsService.create(postId, request.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(['agent/recommendation', 'api/agent/recommendation'])
  createDirect(
    @Body() createDirectRecommendationDto: CreateDirectRecommendationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.aiRecommendationsService.createDirect(
      createDirectRecommendationDto,
      request.user.sub,
    );
  }
}
