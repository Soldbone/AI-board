import { ConfigService } from '@nestjs/config';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
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
  const emptyArguments = {
    query: '',
    limit: 0,
    videoId: '',
    youtubeVideoId: '',
    postId: '',
  };

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
      toolName: 'none',
      arguments: emptyArguments,
      rationale: '',
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

  it('uses an OpenAI strict structured-output friendly root object schema', async () => {
    mockInvoke.mockResolvedValueOnce({
      type: 'final',
      toolName: 'none',
      arguments: emptyArguments,
      rationale: '',
      answer: '답변입니다.',
      limitations: [],
    });
    const provider = new OpenAiAgentLlmProvider(
      createConfigService({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await provider.decide({
      postId: 'post',
      question: '질문',
      observations: [],
      availableTools: [],
      finalOnly: true,
    });

    const structuredOutputCalls = mockWithStructuredOutput.mock.calls as unknown as Array<
      [Parameters<typeof toJsonSchema>[0], unknown]
    >;
    const schema = structuredOutputCalls[0][0];
    const jsonSchema = toJsonSchema(schema, {
      cycles: 'ref',
      reused: 'ref',
    }) as Record<string, unknown>;
    const properties = jsonSchema.properties as Record<string, unknown>;
    const argumentSchema = properties.arguments as Record<string, unknown>;

    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema).not.toHaveProperty('oneOf');
    expect(jsonSchema).toMatchObject({
      additionalProperties: false,
      required: ['type', 'toolName', 'arguments', 'rationale', 'answer', 'limitations'],
    });
    expect(argumentSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['query', 'limit', 'videoId', 'youtubeVideoId', 'postId'],
    });
  });

  it('normalizes LangChain structured tool call decisions', async () => {
    mockInvoke.mockResolvedValueOnce({
      type: 'tool_call',
      toolName: 'transcript.searchChunks',
      arguments: {
        query: '질문',
        limit: 5,
        videoId: '',
        youtubeVideoId: '',
        postId: '',
      },
      answer: '',
      limitations: [],
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

  it('rejects tool calls without a concrete tool name', async () => {
    mockInvoke.mockResolvedValueOnce({
      type: 'tool_call',
      toolName: 'none',
      arguments: emptyArguments,
      rationale: '',
      answer: '',
      limitations: [],
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

  it('rejects empty final answers', async () => {
    mockInvoke.mockResolvedValueOnce({
      type: 'final',
      toolName: 'none',
      arguments: emptyArguments,
      rationale: '',
      answer: ' ',
      limitations: [],
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
        availableTools: [],
        finalOnly: true,
      }),
    ).rejects.toMatchObject<Partial<AgentLlmError>>({
      code: 'AGENT_LLM_INVALID_RESPONSE',
    });
  });
});
