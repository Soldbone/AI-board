import { Controller, Get, Param } from '@nestjs/common';
import { VideosService } from './videos.service';

@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get(':videoId')
  getVideo(@Param('videoId') videoId: string) {
    return this.videosService.getVideo(videoId);
  }
}
