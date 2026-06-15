import { ConfigService } from '@nestjs/config';
import { AgentLlmError, OpenAiAgentLlmProvider } from './agent-llm.provider';

describe('OpenAiAgentLlmProvider', () => {
  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails without falling back when OpenAI API key is missing', async () => {
    const provider = new OpenAiAgentLlmProvider(createConfigService({}));

    await expect(
      provider.decide({
        postId: 'post',
        question: '질문',
        observations: [],
        availableTools: [],
        finalOnly: false,
      }),
    ).rejects.toMatchObject<Partial<AgentLlmError>>({
      code: 'MISSING_OPENAI_API_KEY',
    });
  });

  it('parses OpenAI structured final decisions with mocked fetch', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            type: 'final',
            answer: '근거 후보를 기준으로 보면 관련 구간이 있습니다.',
            limitations: ['최종 사실 판정은 아닙니다.'],
          }),
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAiAgentLlmProvider(
      createConfigService({
        OPENAI_API_KEY: 'test-key',
        AGENT_MODEL: 'test-model',
        AGENT_TIMEOUT_MS: '1000',
        AGENT_MAX_OUTPUT_TOKENS: '200',
      }),
    );

    await expect(
      provider.decide({
        postId: 'post',
        question: '질문',
        observations: [],
        availableTools: ['post.getContext'],
        finalOnly: true,
      }),
    ).resolves.toEqual({
      type: 'final',
      answer: '근거 후보를 기준으로 보면 관련 구간이 있습니다.',
      limitations: ['최종 사실 판정은 아닙니다.'],
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
});
