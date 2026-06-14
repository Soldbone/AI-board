import { ConfigService } from '@nestjs/config';
import { CommentType } from '../../common/enums/ai-status.enum';
import { ModerationStatus } from '../../common/enums/comment-status.enum';
import { RuleBasedCommentAnalyzerProvider } from './comment-analyzer.provider';
import { OpenAiCommentAnalyzerProvider } from './openai-comment-analyzer.provider';

describe('OpenAiCommentAnalyzerProvider', () => {
  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  const createProvider = (
    values: Record<string, string | undefined>,
    fallbackProvider: RuleBasedCommentAnalyzerProvider = {
      analyze: jest.fn().mockResolvedValue({
        commentType: CommentType.CHITCHAT,
        moderationStatus: ModerationStatus.NORMAL,
      }),
    } as unknown as RuleBasedCommentAnalyzerProvider,
  ) => new OpenAiCommentAnalyzerProvider(createConfigService(values), fallbackProvider);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses rule-based fallback when OpenAI API key is missing', async () => {
    const fallbackProvider = {
      analyze: jest.fn().mockResolvedValue({
        commentType: CommentType.OPINION,
        moderationStatus: ModerationStatus.NORMAL,
      }),
    } as unknown as RuleBasedCommentAnalyzerProvider;
    const provider = createProvider({}, fallbackProvider);

    const result = await provider.analyze('개인적으로 좋은 영상이라고 생각해요');

    expect(result).toEqual({
      commentType: CommentType.OPINION,
      moderationStatus: ModerationStatus.NORMAL,
    });
    expect(fallbackProvider.analyze).toHaveBeenCalledWith('개인적으로 좋은 영상이라고 생각해요');
  });

  it('uses OpenAI structured output when API call succeeds', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            commentType: CommentType.FACT_CLAIM,
            moderationStatus: ModerationStatus.NORMAL,
          }),
        }),
        { status: 200 },
      ),
    );
    const provider = createProvider({
      OPENAI_API_KEY: 'test-key',
      COMMENT_ANALYSIS_MODEL: 'test-model',
      COMMENT_ANALYSIS_TIMEOUT_MS: '1000',
    });

    const result = await provider.analyze('2024년에 조회수가 100만을 넘었습니다');

    expect(result).toEqual({
      commentType: CommentType.FACT_CLAIM,
      moderationStatus: ModerationStatus.NORMAL,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
  });

  it('falls back to rule-based analysis when OpenAI API fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'rate limited',
          },
        }),
        { status: 429 },
      ),
    );
    const fallbackProvider = {
      analyze: jest.fn().mockResolvedValue({
        commentType: CommentType.TOXIC,
        moderationStatus: ModerationStatus.NEEDS_REVIEW,
      }),
    } as unknown as RuleBasedCommentAnalyzerProvider;
    const provider = createProvider(
      {
        OPENAI_API_KEY: 'test-key',
      },
      fallbackProvider,
    );

    const result = await provider.analyze('바보 같은 댓글');

    expect(result).toEqual({
      commentType: CommentType.TOXIC,
      moderationStatus: ModerationStatus.NEEDS_REVIEW,
    });
    expect(fallbackProvider.analyze).toHaveBeenCalledWith('바보 같은 댓글');
  });
});
