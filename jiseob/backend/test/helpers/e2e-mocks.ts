import { AgentLlmProvider, AgentModelDecision } from '../../src/agent/agent-llm.provider';
import { CommentAnalyzerError } from '../../src/ai/comment-analysis/comment-analyzer.provider';
import { CommentType } from '../../src/common/enums/ai-status.enum';
import { ModerationStatus } from '../../src/common/enums/comment-status.enum';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const never = async <T>(): Promise<T> => new Promise<T>(() => undefined);

export type E2eMocks = {
  youtubeMetadataProvider: {
    fetchMetadata: jest.Mock;
  };
  youtubeTranscriptProvider: {
    fetchTranscript: jest.Mock;
  };
  embeddingProvider: {
    embedTexts: jest.Mock;
  };
  commentAnalyzerProvider: {
    analyze: jest.Mock;
  };
  summaryProvider: {
    summarize: jest.Mock;
  };
  agentLlmProvider: AgentLlmProvider;
};

export const deterministicEmbedding = (dimension = 1536): number[] =>
  Array.from({ length: dimension }, (_, index) => (index === 0 ? 1 : 0));

export const createE2eMocks = (): E2eMocks => {
  const embedding = deterministicEmbedding();

  return {
    youtubeMetadataProvider: {
      fetchMetadata: jest.fn(() => never()),
    },
    youtubeTranscriptProvider: {
      fetchTranscript: jest.fn(() => never()),
    },
    embeddingProvider: {
      embedTexts: jest.fn(async (texts: string[]) => texts.map(() => embedding)),
    },
    commentAnalyzerProvider: {
      analyze: jest.fn(async (content: string) => {
        await delay(5);

        const normalizedContent = content.toLowerCase();

        if (normalizedContent.includes('fail-analysis')) {
          throw new CommentAnalyzerError(
            'COMMENT_ANALYSIS_FAILED',
            '댓글 분석을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.',
            'mock failure',
          );
        }

        if (normalizedContent.includes('toxic') || content.includes('바보')) {
          return {
            commentType: CommentType.TOXIC,
            moderationStatus: ModerationStatus.NEEDS_REVIEW,
          };
        }

        if (/\d/.test(content) || normalizedContent.includes('fact')) {
          return {
            commentType: CommentType.FACT_CLAIM,
            moderationStatus: ModerationStatus.NORMAL,
          };
        }

        return {
          commentType: CommentType.OPINION,
          moderationStatus: ModerationStatus.NORMAL,
        };
      }),
    },
    summaryProvider: {
      summarize: jest.fn(async () => ({
        summaryText: '테스트 요약',
      })),
    },
    agentLlmProvider: {
      model: 'e2e-agent-model',
      decide: jest.fn(
        async (): Promise<AgentModelDecision> => ({
          type: 'final',
          answer: '테스트 Agent 답변',
          limitations: ['E2E mock response'],
        }),
      ),
    },
  };
};
