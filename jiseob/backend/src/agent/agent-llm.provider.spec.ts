import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { AgentLlmError, OpenAiAgentLlmProvider } from './agent-llm.provider';

const mockInvoke = jest.fn();
const mockWithStructuredOutput = jest.fn(() => ({
  invoke: mockInvoke,
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: mockWithStructuredOutput,
  })),
}));

describe('OpenAiAgentLlmProvider', () => {
  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  afterEach(() => {
    jest.clearAllMocks();
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
    expect(ChatOpenAI).not.toHaveBeenCalled();
  });

  it('normalizes LangChain structured final decisions', async () => {
    mockInvoke.mockResolvedValueOnce({
      type: 'final',
      answer: '근거 후보를 기준으로 보면 관련 구간이 있습니다.',
      limitations: [' 최종 사실 판정은 아닙니다. ', ''],
    });
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
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        model: 'test-model',
        timeout: 1000,
        maxTokens: 200,
        maxRetries: 0,
        modelKwargs: {
          store: false,
        },
        zdrEnabled: true,
      }),
    );
    expect(mockWithStructuredOutput).toHaveBeenCalledWith(expect.any(Object), {
      name: 'agent_decision',
      strict: true,
    });
    expect(mockInvoke).toHaveBeenCalledWith(expect.any(Array));
  });

  it('normalizes LangChain structured tool call decisions', async () => {
    mockInvoke.mockResolvedValueOnce({
      type: 'tool_call',
      toolName: 'transcript.searchChunks',
      arguments: {
        query: '질문',
        limit: 5,
      },
      rationale: '자막 검색이 필요합니다.',
    });
    const provider = new OpenAiAgentLlmProvider(
      createConfigService({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await expect(
      provider.decide({
        postId: 'post',
        question: '질문',
        observations: [],
        availableTools: ['transcript.searchChunks'],
        finalOnly: false,
      }),
    ).resolves.toEqual({
      type: 'tool_call',
      toolName: 'transcript.searchChunks',
      arguments: {
        query: '질문',
        limit: 5,
      },
      rationale: '자막 검색이 필요합니다.',
    });
  });

  it('sanitizes LangChain invocation failures', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('provider raw failure'));
    const provider = new OpenAiAgentLlmProvider(
      createConfigService({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await expect(
      provider.decide({
        postId: 'post',
        question: '질문',
        observations: [],
        availableTools: [],
        finalOnly: true,
      }),
    ).rejects.toMatchObject<Partial<AgentLlmError>>({
      code: 'AGENT_LLM_FAILED',
      userMessage: 'Agent LLM 호출에 실패했습니다.',
    });
  });

  it('rejects invalid structured output', async () => {
    mockInvoke.mockResolvedValueOnce({
      type: 'tool_call',
      toolName: 'post.getContext',
    });
    const provider = new OpenAiAgentLlmProvider(
      createConfigService({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await expect(
      provider.decide({
        postId: 'post',
        question: '질문',
        observations: [],
        availableTools: ['post.getContext'],
        finalOnly: false,
      }),
    ).rejects.toMatchObject<Partial<AgentLlmError>>({
      code: 'AGENT_LLM_INVALID_RESPONSE',
    });
  });
});
