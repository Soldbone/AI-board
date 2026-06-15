import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { AgentLlmProvider } from '../../src/agent/agent-llm.provider';
import { AgentService } from '../../src/agent/agent.service';
import { AppModule } from '../../src/app.module';
import { CommentAnalyzerProvider } from '../../src/ai/comment-analysis/comment-analyzer.provider';
import { CommentAnalysisService } from '../../src/ai/comment-analysis/comment-analysis.service';
import { RagService } from '../../src/ai/rag/rag.service';
import { SummaryProvider } from '../../src/ai/summary/summary.provider';
import { SummaryService } from '../../src/ai/summary/summary.service';
import { EmbeddingProvider } from '../../src/videos/providers/embedding.provider';
import { VideoProcessingService } from '../../src/videos/video-processing.service';
import { YoutubeMetadataProvider } from '../../src/videos/providers/youtube-metadata.provider';
import { YoutubeTranscriptProvider } from '../../src/videos/providers/youtube-transcript.provider';
import { ensureE2eDatabase, runE2eMigrations } from './e2e-database';
import { createE2eMocks, E2eMocks } from './e2e-mocks';

export type E2eTestApp = {
  app: INestApplication;
  dataSource: DataSource;
  httpServer: unknown;
  mocks: E2eMocks;
  waitForBackgroundTasks: () => Promise<void>;
};

type TrackableMethod = (...args: never[]) => Promise<unknown>;

const createBackgroundTaskTracker = () => {
  const pendingTasks = new Set<Promise<unknown>>();

  const track = <T>(task: Promise<T>): Promise<T> => {
    const trackedTask = task.finally(() => {
      pendingTasks.delete(trackedTask);
    });

    pendingTasks.add(trackedTask);

    return trackedTask;
  };

  const waitForBackgroundTasks = async (): Promise<void> => {
    while (pendingTasks.size > 0) {
      await Promise.allSettled([...pendingTasks]);
    }
  };

  return {
    track,
    waitForBackgroundTasks,
  };
};

const trackAsyncMethod = <T extends object>(
  instance: T,
  methodName: keyof T,
  track: <R>(task: Promise<R>) => Promise<R>,
): void => {
  const originalMethod = instance[methodName];

  if (typeof originalMethod !== 'function') {
    throw new Error(`Cannot track non-function method: ${String(methodName)}`);
  }

  jest
    .spyOn(instance, methodName as never)
    .mockImplementation(((...args: never[]) =>
      track((originalMethod as TrackableMethod).apply(instance, args))) as never);
};

export const createE2eApp = async (): Promise<E2eTestApp> => {
  await ensureE2eDatabase();

  const mocks = createE2eMocks();
  const backgroundTaskTracker = createBackgroundTaskTracker();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(YoutubeMetadataProvider)
    .useValue(mocks.youtubeMetadataProvider)
    .overrideProvider(YoutubeTranscriptProvider)
    .useValue(mocks.youtubeTranscriptProvider)
    .overrideProvider(EmbeddingProvider)
    .useValue(mocks.embeddingProvider)
    .overrideProvider(CommentAnalyzerProvider)
    .useValue(mocks.commentAnalyzerProvider)
    .overrideProvider(SummaryProvider)
    .useValue(mocks.summaryProvider)
    .overrideProvider(AgentLlmProvider)
    .useValue(mocks.agentLlmProvider)
    .compile();

  const app = moduleRef.createNestApplication();
  const apiPrefix = process.env.API_PREFIX ?? '/api/v1';

  app.use(cookieParser());
  app.setGlobalPrefix(apiPrefix.replace(/^\/+/, ''));
  app.enableCors({
    origin: [process.env.WEB_ORIGIN ?? 'http://localhost:5173'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.init();

  const dataSource = app.get(DataSource);

  await runE2eMigrations(dataSource);

  const videoProcessingService = app.get(VideoProcessingService);

  jest.spyOn(videoProcessingService, 'enqueueProcessing').mockImplementation(async (videoId) => ({
    videoId,
    accepted: true,
  }));

  trackAsyncMethod(app.get(CommentAnalysisService), 'analyzeComment', backgroundTaskTracker.track);
  trackAsyncMethod(app.get(RagService), 'processComment', backgroundTaskTracker.track);
  trackAsyncMethod(app.get(SummaryService), 'generateSummary', backgroundTaskTracker.track);
  trackAsyncMethod(app.get(AgentService), 'executeRun', backgroundTaskTracker.track);

  return {
    app,
    dataSource,
    httpServer: app.getHttpServer(),
    mocks,
    waitForBackgroundTasks: backgroundTaskTracker.waitForBackgroundTasks,
  };
};
