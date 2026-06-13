import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderError } from './provider-error';

export type YoutubeMetadata = {
  title: string | null;
  channelName: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  description: string | null;
  youtubeViewCount: number | null;
  youtubeLikeCount: number | null;
  youtubeCommentCount: number | null;
};

export abstract class YoutubeMetadataProvider {
  abstract fetchMetadata(youtubeVideoId: string): Promise<YoutubeMetadata>;
}

type YoutubeVideosListResponse = {
  error?: {
    message?: string;
  };
  items?: Array<{
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: Record<string, { url?: string }>;
      publishedAt?: string;
      description?: string;
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
  }>;
};

@Injectable()
export class YoutubeDataApiMetadataProvider implements YoutubeMetadataProvider {
  constructor(private readonly configService: ConfigService) {}

  async fetchMetadata(youtubeVideoId: string): Promise<YoutubeMetadata> {
    const apiKey = this.configService.get<string>('YOUTUBE_API_KEY');

    if (!apiKey) {
      throw new ProviderError(
        'MISSING_YOUTUBE_API_KEY',
        'YouTube API key가 설정되지 않아 영상 메타데이터를 가져오지 못했습니다.',
      );
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,statistics');
    url.searchParams.set('id', youtubeVideoId);
    url.searchParams.set('key', apiKey);

    const response = await fetch(url);
    const body = (await response.json().catch(() => ({}))) as YoutubeVideosListResponse;

    if (!response.ok) {
      throw new ProviderError(
        'YOUTUBE_API_ERROR',
        'YouTube 메타데이터를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.',
        body.error?.message,
      );
    }

    const item = body.items?.[0];

    if (!item) {
      throw new ProviderError(
        'YOUTUBE_VIDEO_NOT_FOUND',
        'YouTube 영상을 찾을 수 없습니다.',
        `YouTube video not found: ${youtubeVideoId}`,
      );
    }

    return {
      title: item.snippet?.title ?? null,
      channelName: item.snippet?.channelTitle ?? null,
      thumbnailUrl: this.pickThumbnailUrl(item.snippet?.thumbnails),
      publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null,
      description: item.snippet?.description ?? null,
      youtubeViewCount: this.parseCount(item.statistics?.viewCount),
      youtubeLikeCount: this.parseCount(item.statistics?.likeCount),
      youtubeCommentCount: this.parseCount(item.statistics?.commentCount),
    };
  }

  private pickThumbnailUrl(
    thumbnails: Record<string, { url?: string }> | undefined,
  ): string | null {
    const preferredKeys = ['maxres', 'standard', 'high', 'medium', 'default'];

    for (const key of preferredKeys) {
      const url = thumbnails?.[key]?.url;

      if (url) {
        return url;
      }
    }

    return null;
  }

  private parseCount(value: string | undefined): number | null {
    if (!value) {
      return null;
    }

    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }
}
