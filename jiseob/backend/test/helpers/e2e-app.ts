import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { AgentLlmProvider } from '../../src/agent/agent-llm.provider';
import { AppModule } from '../../src/app.module';
import { CommentAnalyzerProvider } from '../../src/ai/comment-analysis/comment-analyzer.provider';
import { SummaryProvider } from '../../src/ai/summary/summary.provider';
import { EmbeddingProvider } from '../../src/videos/providers/embedding.provider';
import { YoutubeMetadataProvider } from '../../src/videos/providers/youtube-metadata.provider';
import { YoutubeTranscriptProvider } from '../../src/videos/providers/youtube-transcript.provider';
import { ensureE2eDatabase, runE2eMigrations } from './e2e-database';
import { createE2eMocks, E2eMocks } from './e2e-mocks';

export type E2eTestApp = {
  app: INestApplication;
  dataSource: DataSource;
  httpServer: unknown;
  mocks: E2eMocks;
};

export const createE2eApp = async (): Promise<E2eTestApp> => {
  await ensureE2eDatabase();

  const mocks = createE2eMocks();
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

  return {
    app,
    dataSource,
    httpServer: app.getHttpServer(),
    mocks,
  };
};
