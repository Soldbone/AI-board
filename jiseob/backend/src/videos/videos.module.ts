import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { CommonModule } from '../common/common.module';
import { Post } from '../posts/entities/post.entity';
import { TranscriptChunk } from './entities/transcript-chunk.entity';
import { Video } from './entities/video.entity';
import {
  YoutubeDataApiMetadataProvider,
  YoutubeMetadataProvider,
} from './providers/youtube-metadata.provider';
import {
  YoutubeTranscriptCliProvider,
  YoutubeTranscriptProvider,
} from './providers/youtube-transcript.provider';
import { TranscriptChunkingService } from './transcript-chunking.service';
import { VideoProcessingService } from './video-processing.service';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Video, TranscriptChunk, Post]), CommonModule, AiModule],
  controllers: [VideosController],
  providers: [
    VideosService,
    VideoProcessingService,
    TranscriptChunkingService,
    {
      provide: YoutubeMetadataProvider,
      useClass: YoutubeDataApiMetadataProvider,
    },
    {
      provide: YoutubeTranscriptProvider,
      useClass: YoutubeTranscriptCliProvider,
    },
  ],
  exports: [VideosService, VideoProcessingService, YoutubeMetadataProvider],
})
export class VideosModule {}
