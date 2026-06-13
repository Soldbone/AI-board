import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  EmbeddingStatus,
  MetadataStatus,
  TranscriptStatus,
} from '../common/enums/video-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { TranscriptChunk } from './entities/transcript-chunk.entity';
import { Video } from './entities/video.entity';
import { ProviderError } from './providers/provider-error';
import { VideoProcessingService } from './video-processing.service';

describe('VideoProcessingService', () => {
  const user = {
    id: '01J00000000000000000000000',
    email: 'user@example.com',
    role: UserRole.USER,
    sessionId: '01J00000000000000000000001',
  };
  const video = {
    id: '01J00000000000000000000002',
    youtubeVideoId: 'dQw4w9WgXcQ',
    metadataStatus: MetadataStatus.PENDING,
    transcriptStatus: TranscriptStatus.PENDING,
    embeddingStatus: EmbeddingStatus.PENDING,
    processingLockedUntil: null,
  } as Video;

  const createService = (overrides: {
    dataSource?: unknown;
    metadataProvider?: unknown;
    transcriptProvider?: unknown;
    embeddingProvider?: unknown;
    transcriptChunkingService?: unknown;
    videosRepository?: unknown;
    transcriptChunksRepository?: unknown;
    postsRepository?: unknown;
  }) =>
    new VideoProcessingService(
      (overrides.dataSource ?? {}) as never,
      (overrides.metadataProvider ?? {}) as never,
      (overrides.transcriptProvider ?? {}) as never,
      (overrides.embeddingProvider ?? {}) as never,
      (overrides.transcriptChunkingService ?? {}) as never,
      (overrides.videosRepository ?? {}) as never,
      (overrides.transcriptChunksRepository ?? {}) as never,
      (overrides.postsRepository ?? {}) as never,
    );

  it('rejects retry when the user has no active post for the video', async () => {
    const service = createService({
      videosRepository: {
        findOne: jest.fn().mockResolvedValue(video),
      },
      postsRepository: {
        count: jest.fn().mockResolvedValue(0),
      },
    });

    await expect(service.retryProcessing(user, video.id)).rejects.toThrow(ForbiddenException);
  });

  it('rejects retry when processing lock is already held', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 0 });
    const service = createService({
      videosRepository: {
        findOne: jest.fn().mockResolvedValue(video),
        createQueryBuilder: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          execute,
        }),
      },
      postsRepository: {
        count: jest.fn().mockResolvedValue(1),
      },
    });

    await expect(service.retryProcessing(user, video.id)).rejects.toThrow(ConflictException);
  });

  it('stores sanitized failure statuses when providers fail', async () => {
    const videoUpdates: Array<Partial<Video>> = [];
    const videoRepository = {
      findOne: jest.fn().mockResolvedValue(video),
      update: jest.fn(async (_videoId: string, update: Partial<Video>) => {
        videoUpdates.push(update);
      }),
    };
    const transcriptChunkRepository = {
      delete: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity: typeof Video | typeof TranscriptChunk) => {
        if (entity === Video) {
          return videoRepository;
        }

        return transcriptChunkRepository;
      }),
    } as unknown as EntityManager;
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
        ),
      },
      metadataProvider: {
        fetchMetadata: jest
          .fn()
          .mockRejectedValue(
            new ProviderError('MISSING_YOUTUBE_API_KEY', 'YouTube API key가 설정되지 않았습니다.'),
          ),
      },
      transcriptProvider: {
        fetchTranscript: jest
          .fn()
          .mockRejectedValue(
            new ProviderError('TRANSCRIPT_NOT_AVAILABLE', '사용할 수 있는 자막을 찾지 못했습니다.'),
          ),
      },
      embeddingProvider: {
        embedTexts: jest.fn(),
      },
      transcriptChunkingService: {
        createChunks: jest.fn(),
      },
      videosRepository: videoRepository,
      transcriptChunksRepository: {
        save: jest.fn(),
      },
      postsRepository: {
        count: jest.fn(),
      },
    });

    await (
      service as unknown as {
        processLockedVideo(videoId: string): Promise<void>;
      }
    ).processLockedVideo(video.id);

    expect(videoUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadataStatus: MetadataStatus.FAILED,
          metadataErrorCode: 'MISSING_YOUTUBE_API_KEY',
        }),
        expect.objectContaining({
          transcriptStatus: TranscriptStatus.NOT_AVAILABLE,
          transcriptErrorCode: 'TRANSCRIPT_NOT_AVAILABLE',
          embeddingStatus: EmbeddingStatus.FAILED,
          embeddingErrorCode: 'TRANSCRIPT_REQUIRED',
        }),
        expect.objectContaining({
          processingLockedUntil: null,
        }),
      ]),
    );
  });
});
