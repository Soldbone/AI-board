import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { VideosService } from './videos.service';

@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get(':videoId')
  getVideo(@Param('videoId') videoId: string) {
    return this.videosService.getVideo(videoId);
  }

  @Post(':videoId/processing/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  retryProcessing(@CurrentUser() user: AuthenticatedUser, @Param('videoId') videoId: string) {
    return this.videosService.retryProcessing(user, videoId);
  }
}
