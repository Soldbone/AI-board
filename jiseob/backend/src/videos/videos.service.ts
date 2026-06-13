import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { extractYoutubeVideoId } from '../common/utils/youtube-url.util';
import { Video } from './entities/video.entity';

export type VideoResponse = {
  id: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  title?: string | null;
  channelName?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: Date | null;
  description?: string | null;
  youtubeViewCount?: number | null;
  youtubeLikeCount?: number | null;
  youtubeCommentCount?: number | null;
  metadataStatus: string;
  transcriptStatus: string;
  embeddingStatus: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videosRepository: Repository<Video>,
  ) {}

  async findOrCreateByYoutubeUrl(youtubeUrl: string, manager?: EntityManager): Promise<Video> {
    const youtubeVideoId = extractYoutubeVideoId(youtubeUrl);
    const repository = manager?.getRepository(Video) ?? this.videosRepository;
    const existingVideo = await repository.findOne({
      where: { youtubeVideoId },
    });

    if (existingVideo) {
      return existingVideo;
    }

    return repository.save(
      repository.create({
        youtubeVideoId,
        youtubeUrl,
      }),
    );
  }

  async getVideo(videoId: string): Promise<VideoResponse> {
    const video = await this.videosRepository.findOne({
      where: { id: videoId },
    });

    if (!video) {
      throw new NotFoundException('영상을 찾을 수 없습니다.');
    }

    return this.toVideoResponse(video);
  }

  toVideoResponse(video: Video): VideoResponse {
    return {
      id: video.id,
      youtubeVideoId: video.youtubeVideoId,
      youtubeUrl: video.youtubeUrl,
      title: video.title,
      channelName: video.channelName,
      thumbnailUrl: video.thumbnailUrl,
      publishedAt: video.publishedAt,
      description: video.description,
      youtubeViewCount: video.youtubeViewCount,
      youtubeLikeCount: video.youtubeLikeCount,
      youtubeCommentCount: video.youtubeCommentCount,
      metadataStatus: video.metadataStatus,
      transcriptStatus: video.transcriptStatus,
      embeddingStatus: video.embeddingStatus,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    };
  }
}
