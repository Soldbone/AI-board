import { UserRole } from '../common/enums/user-role.enum';
import { McpServerService } from '../mcp/mcp-server.service';
import { AgentMcpCallerService } from './agent-mcp-caller.service';

describe('AgentMcpCallerService', () => {
  const user = {
    id: '01J00000000000000000000000',
    email: 'user@example.com',
    role: UserRole.USER,
    sessionId: '01J00000000000000000000001',
  };

  const createService = (handleRequest: jest.Mock) =>
    new AgentMcpCallerService({ handleRequest } as unknown as McpServerService);

  it('unwraps successful MCP tool call results', async () => {
    const handleRequest = jest.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 'run:1',
      result: {
        content: [{ type: 'text', text: '{"ok":true}' }],
        structuredContent: { ok: true },
        isError: false,
      },
    });
    const service = createService(handleRequest);

    await expect(
      service.callTool('run', 1, user, 'post.getContext', { postId: 'post' }, new Set()),
    ).resolves.toEqual({
      ok: true,
      structuredContent: { ok: true },
      contentText: '{"ok":true}',
    });
  });

  it('normalizes JSON-RPC protocol errors', async () => {
    const service = createService(
      jest.fn().mockResolvedValue({
        jsonrpc: '2.0',
        id: 'run:1',
        error: {
          code: -32602,
          message: 'Invalid params',
          data: {
            errorCode: 'INVALID_TOOL_NAME',
            errorMessage: 'tool name은 문자열이어야 합니다.',
          },
        },
      }),
    );

    await expect(
      service.callTool('run', 1, user, 'post.getContext', { postId: 'post' }, new Set()),
    ).resolves.toEqual({
      ok: false,
      errorCode: 'INVALID_TOOL_NAME',
      errorMessage: 'tool name은 문자열이어야 합니다.',
    });
  });

  it('normalizes tool-level failures and blocks duplicate calls', async () => {
    const handleRequest = jest.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 'run:1',
      result: {
        content: [{ type: 'text', text: '검색할 수 있는 자막이 없습니다.' }],
        structuredContent: {
          errorCode: 'TRANSCRIPT_UNAVAILABLE',
          errorMessage: '검색할 수 있는 자막이 없습니다.',
        },
        isError: true,
      },
    });
    const service = createService(handleRequest);
    const seen = new Set<string>();
    const args = { postId: 'post', query: '질문', limit: 5 };

    await expect(
      service.callTool('run', 1, user, 'transcript.searchChunks', args, seen),
    ).resolves.toEqual({
      ok: false,
      errorCode: 'TRANSCRIPT_UNAVAILABLE',
      errorMessage: '검색할 수 있는 자막이 없습니다.',
    });

    await expect(
      service.callTool('run', 2, user, 'transcript.searchChunks', args, seen),
    ).resolves.toEqual({
      ok: false,
      errorCode: 'DUPLICATE_TOOL_CALL',
      errorMessage: '같은 도구와 인자를 반복 호출할 수 없습니다.',
    });
    expect(handleRequest).toHaveBeenCalledTimes(1);
  });
});
