import { ConfigService } from '@nestjs/config';
import { OpenAiSummaryProvider } from './openai-summary.provider';
import { SummaryProviderError, SummaryProviderInput } from './summary.provider';

describe('OpenAiSummaryProvider', () => {
  const originalFetch = globalThis.fetch;
  const input: SummaryProviderInput = {
    rootCommentId: '01J00000000000000000000000',
    postId: '01J00000000000000000000001',
    mode: 'full',
    comments: [
      {
        id: '01J00000000000000000000002',
        authorNickname: '작성자',
        content: '댓글 내용',
        createdAt: new Date('2026-06-15T00:00:00.000Z'),
        isRoot: true,
      },
    ],
  };

  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('fails without a runtime fallback when OpenAI API key is missing', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const provider = new OpenAiSummaryProvider(createConfigService({}));

    await expect(provider.summarize(input)).rejects.toMatchObject<Partial<SummaryProviderError>>({
      code: 'MISSING_OPENAI_API_KEY',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the Responses API and parses structured summary text', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        output_text: JSON.stringify({ summaryText: '요약 결과' }),
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const provider = new OpenAiSummaryProvider(
      createConfigService({
        OPENAI_API_KEY: 'test-key',
        SUMMARY_MODEL: 'test-model',
        SUMMARY_TIMEOUT_MS: '1000',
        SUMMARY_MAX_OUTPUT_TOKENS: '200',
      }),
    );

    await expect(provider.summarize(input)).resolves.toEqual({ summaryText: '요약 결과' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<
      string,
      unknown
    >;
    expect(requestBody).toMatchObject({
      model: 'test-model',
      max_output_tokens: 200,
      store: false,
    });
    expect(requestBody.text).toMatchObject({
      format: {
        type: 'json_schema',
        name: 'comment_thread_summary',
        strict: true,
      },
    });
  });

  it('sanitizes non-ok provider responses', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({
        error: {
          message: 'raw provider failure',
        },
      }),
    }) as unknown as typeof fetch;
    const provider = new OpenAiSummaryProvider(
      createConfigService({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await expect(provider.summarize(input)).rejects.toMatchObject<Partial<SummaryProviderError>>({
      code: 'SUMMARY_PROVIDER_FAILED',
      userMessage: '댓글 요약 API 호출에 실패했습니다. 잠시 후 다시 시도해주세요.',
    });
  });

  it('rejects invalid structured output', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        output_text: JSON.stringify({ nope: 'missing summaryText' }),
      }),
    }) as unknown as typeof fetch;
    const provider = new OpenAiSummaryProvider(
      createConfigService({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await expect(provider.summarize(input)).rejects.toMatchObject<Partial<SummaryProviderError>>({
      code: 'SUMMARY_PROVIDER_INVALID_RESPONSE',
    });
  });
});
