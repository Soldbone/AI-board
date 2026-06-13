import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { Post } from '../posts/entities/post.entity';
import { TranscriptChunk } from './entities/transcript-chunk.entity';
import { Video } from './entities/video.entity';
import { EmbeddingProvider, OpenAiEmbeddingProvider } from './providers/embedding.provider';
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
  imports: [TypeOrmModule.forFeature([Video, TranscriptChunk, Post]), CommonModule],
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
    {
      provide: EmbeddingProvider,
      useClass: OpenAiEmbeddingProvider,
    },
  ],
  exports: [VideosService, VideoProcessingService],
})
export class VideosModule {}
