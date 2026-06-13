import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  EmbeddingStatus,
  MetadataStatus,
  TranscriptStatus,
} from '../common/enums/video-status.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Post } from '../posts/entities/post.entity';
import { TranscriptChunk } from './entities/transcript-chunk.entity';
import { Video } from './entities/video.entity';
import { EmbeddingProvider } from './providers/embedding.provider';
import { ProviderError, toProviderError } from './providers/provider-error';
import { YoutubeMetadataProvider } from './providers/youtube-metadata.provider';
import { YoutubeTranscriptProvider } from './providers/youtube-transcript.provider';
import { TranscriptChunkingService } from './transcript-chunking.service';

const PROCESSING_LOCK_MS = 10 * 60 * 1000;

export type VideoProcessingAcceptedResponse = {
  videoId: string;
  accepted: true;
};

@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly metadataProvider: YoutubeMetadataProvider,
    private readonly transcriptProvider: YoutubeTranscriptProvider,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly transcriptChunkingService: TranscriptChunkingService,
    @InjectRepository(Video)
    private readonly videosRepository: Repository<Video>,
    @InjectRepository(TranscriptChunk)
    private readonly transcriptChunksRepository: Repository<TranscriptChunk>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
  ) {}

  async enqueueProcessing(
    videoId: string,
    options: {
      force?: boolean;
      throwOnConflict?: boolean;
    } = {},
  ): Promise<VideoProcessingAcceptedResponse> {
    const video = await this.findVideoOrThrow(videoId);

    if (!options.force && this.isProcessingComplete(video)) {
      return { videoId, accepted: true };
    }

    const lockAcquired = await this.acquireProcessingLock(videoId, Boolean(options.force));

    if (!lockAcquired) {
      if (options.throwOnConflict) {
        throw new ConflictException('영상 처리가 이미 진행 중입니다.');
      }

      return { videoId, accepted: true };
    }

    void this.processLockedVideo(videoId).catch((error: unknown) => {
      this.logger.error(
        `Video processing failed unexpectedly: ${videoId}`,
        error instanceof Error ? error.stack : String(error),
      );
    });

    return { videoId, accepted: true };
  }

  async retryProcessing(
    user: AuthenticatedUser,
    videoId: string,
  ): Promise<VideoProcessingAcceptedResponse> {
    await this.findVideoOrThrow(videoId);

    const authoredPostCount = await this.postsRepository.count({
      where: {
        videoId,
        authorId: user.id,
        deletedAt: IsNull(),
      },
    });

    if (authoredPostCount === 0) {
      throw new ForbiddenException('영상 처리 재시도 권한이 없습니다.');
    }

    return this.enqueueProcessing(videoId, {
      force: true,
      throwOnConflict: true,
    });
  }

  private async processLockedVideo(videoId: string): Promise<void> {
    try {
      const video = await this.findVideoOrThrow(videoId);

      await this.processMetadata(video);
      await this.processTranscriptAndEmbedding(video);
    } catch (error) {
      this.logger.error(
        `Video processing pipeline failed: ${videoId}`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      await this.videosRepository.update(videoId, {
        processedAt: new Date(),
        processingLockedUntil: null,
      });
    }
  }

  private async processMetadata(video: Video): Promise<void> {
    try {
      const metadata = await this.metadataProvider.fetchMetadata(video.youtubeVideoId);

      await this.videosRepository.update(video.id, {
        title: metadata.title,
        channelName: metadata.channelName,
        thumbnailUrl: metadata.thumbnailUrl,
        publishedAt: metadata.publishedAt,
        description: metadata.description,
        youtubeViewCount: metadata.youtubeViewCount,
        youtubeLikeCount: metadata.youtubeLikeCount,
        youtubeCommentCount: metadata.youtubeCommentCount,
        metadataStatus: MetadataStatus.SUCCESS,
        metadataErrorCode: null,
        metadataErrorMessage: null,
      });
    } catch (error) {
      const providerError = toProviderError(
        error,
        'YOUTUBE_API_ERROR',
        'YouTube 메타데이터를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.',
      );

      this.logger.warn(`Metadata processing failed for ${video.id}: ${providerError.message}`);
      await this.videosRepository.update(video.id, {
        metadataStatus: MetadataStatus.FAILED,
        metadataErrorCode: providerError.code,
        metadataErrorMessage: providerError.userMessage,
      });
    }
  }

  private async processTranscriptAndEmbedding(video: Video): Promise<void> {
    const languages = this.getTranscriptLanguages();

    try {
      const segments = await this.transcriptProvider.fetchTranscript(
        video.youtubeVideoId,
        languages,
      );
      const chunks = this.transcriptChunkingService.createChunks(segments);

      if (chunks.length === 0) {
        throw new ProviderError(
          'TRANSCRIPT_NOT_AVAILABLE',
          '이 영상에서 사용할 수 있는 자막을 찾지 못했습니다.',
        );
      }

      const savedChunks = await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(TranscriptChunk).delete({ videoId: video.id });
        const transcriptChunks = chunks.map((chunk) =>
          manager.getRepository(TranscriptChunk).create({
            videoId: video.id,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
          }),
        );

        const savedTranscriptChunks = await manager
          .getRepository(TranscriptChunk)
          .save(transcriptChunks);

        await manager.getRepository(Video).update(video.id, {
          transcriptStatus: TranscriptStatus.SUCCESS,
          transcriptErrorCode: null,
          transcriptErrorMessage: null,
          embeddingStatus: EmbeddingStatus.PENDING,
          embeddingErrorCode: null,
          embeddingErrorMessage: null,
        });

        return savedTranscriptChunks;
      });

      await this.processEmbeddings(video, savedChunks);
    } catch (error) {
      const providerError = toProviderError(
        error,
        'TRANSCRIPT_PROVIDER_ERROR',
        'YouTube 자막을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.',
      );

      await this.handleTranscriptFailure(video.id, providerError);
    }
  }

  private async processEmbeddings(video: Video, chunks: TranscriptChunk[]): Promise<void> {
    try {
      const embeddings = await this.embeddingProvider.embedTexts(
        chunks.map((chunk) => chunk.content),
      );

      chunks.forEach((chunk, index) => {
        chunk.embedding = embeddings[index];
      });

      await this.transcriptChunksRepository.save(chunks);
      await this.videosRepository.update(video.id, {
        embeddingStatus: EmbeddingStatus.SUCCESS,
        embeddingErrorCode: null,
        embeddingErrorMessage: null,
      });
    } catch (error) {
      const providerError = toProviderError(
        error,
        'OPENAI_API_ERROR',
        '자막 임베딩을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );

      this.logger.warn(`Embedding processing failed for ${video.id}: ${providerError.message}`);
      await this.videosRepository.update(video.id, {
        embeddingStatus: EmbeddingStatus.FAILED,
        embeddingErrorCode: providerError.code,
        embeddingErrorMessage: providerError.userMessage,
      });
    }
  }

  private async handleTranscriptFailure(
    videoId: string,
    providerError: ProviderError,
  ): Promise<void> {
    const transcriptStatus =
      providerError.code === 'TRANSCRIPT_NOT_AVAILABLE'
        ? TranscriptStatus.NOT_AVAILABLE
        : TranscriptStatus.FAILED;

    this.logger.warn(`Transcript processing failed for ${videoId}: ${providerError.message}`);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(TranscriptChunk).delete({ videoId });
      await manager.getRepository(Video).update(videoId, {
        transcriptStatus,
        transcriptErrorCode: providerError.code,
        transcriptErrorMessage: providerError.userMessage,
        embeddingStatus: EmbeddingStatus.FAILED,
        embeddingErrorCode: 'TRANSCRIPT_REQUIRED',
        embeddingErrorMessage: '자막이 없어 임베딩을 생성할 수 없습니다.',
      });
    });
  }

  private async acquireProcessingLock(videoId: string, reset: boolean): Promise<boolean> {
    const lockedUntil = new Date(Date.now() + PROCESSING_LOCK_MS);
    const updateValues: Partial<Video> = {
      processingLockedUntil: lockedUntil,
    };

    if (reset) {
      Object.assign(updateValues, {
        metadataStatus: MetadataStatus.PENDING,
        transcriptStatus: TranscriptStatus.PENDING,
        embeddingStatus: EmbeddingStatus.PENDING,
        metadataErrorCode: null,
        metadataErrorMessage: null,
        transcriptErrorCode: null,
        transcriptErrorMessage: null,
        embeddingErrorCode: null,
        embeddingErrorMessage: null,
        processedAt: null,
      });
    }

    const result = await this.videosRepository
      .createQueryBuilder()
      .update(Video)
      .set(updateValues)
      .where('"id" = :videoId', { videoId })
      .andWhere('("processing_locked_until" IS NULL OR "processing_locked_until" < now())')
      .execute();

    return Boolean(result.affected);
  }

  private async findVideoOrThrow(videoId: string): Promise<Video> {
    const video = await this.videosRepository.findOne({
      where: { id: videoId },
    });

    if (!video) {
      throw new NotFoundException('영상을 찾을 수 없습니다.');
    }

    return video;
  }

  private isProcessingComplete(video: Video): boolean {
    return (
      video.metadataStatus === MetadataStatus.SUCCESS &&
      video.transcriptStatus === TranscriptStatus.SUCCESS &&
      video.embeddingStatus === EmbeddingStatus.SUCCESS
    );
  }

  private getTranscriptLanguages(): string[] {
    const configuredLanguages = process.env.TRANSCRIPT_LANGUAGES ?? 'ko,en';
    const languages = configuredLanguages
      .split(',')
      .map((language) => language.trim())
      .filter(Boolean);

    return languages.length > 0 ? languages : ['ko', 'en'];
  }
}
