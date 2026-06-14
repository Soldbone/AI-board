import { UserRole } from '../common/enums/user-role.enum';
import { ProviderError } from '../videos/providers/provider-error';
import {
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_TOOL_ERROR,
} from './mcp.errors';
import { McpServerService } from './mcp-server.service';
import { McpTool } from './mcp.types';

describe('McpServerService', () => {
  const user = {
    id: '01J00000000000000000000000',
    email: 'user@example.com',
    role: UserRole.USER,
    sessionId: '01J00000000000000000000001',
  };

  const createTool = (overrides: Partial<McpTool> = {}): McpTool => ({
    definition: {
      name: 'sample.echo',
      description: 'Echoes arguments',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
    },
    execute: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  });

  it('lists registered tools', async () => {
    const tool = createTool();
    const service = new McpServerService([tool]);

    await expect(
      service.handleRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        },
        { user },
      ),
    ).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: [tool.definition],
    });
  });

  it('calls a registered tool by name and arguments', async () => {
    const execute = jest.fn().mockResolvedValue({ echoed: true });
    const tool = createTool({ execute });
    const service = new McpServerService([tool]);
    const args = { message: 'hello' };

    await expect(
      service.handleRequest(
        {
          jsonrpc: '2.0',
          id: 'call-1',
          method: 'tools/call',
          params: {
            name: 'sample.echo',
            arguments: args,
          },
        },
        { user },
      ),
    ).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: 'call-1',
      result: { echoed: true },
    });
    expect(execute).toHaveBeenCalledWith(args, { user });
  });

  it('returns JSON-RPC method error for unsupported methods', async () => {
    const service = new McpServerService([createTool()]);

    await expect(
      service.handleRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'unknown',
        },
        { user },
      ),
    ).resolves.toMatchObject({
      error: {
        code: JSON_RPC_METHOD_NOT_FOUND,
      },
    });
  });

  it('returns invalid params for unknown tools', async () => {
    const service = new McpServerService([createTool()]);

    await expect(
      service.handleRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'missing.tool',
            arguments: {},
          },
        },
        { user },
      ),
    ).resolves.toMatchObject({
      error: {
        code: JSON_RPC_INVALID_PARAMS,
        data: {
          errorCode: 'TOOL_NOT_FOUND',
        },
      },
    });
  });

  it('sanitizes provider failures', async () => {
    const service = new McpServerService([
      createTool({
        execute: jest
          .fn()
          .mockRejectedValue(
            new ProviderError(
              'MISSING_YOUTUBE_API_KEY',
              'YouTube API key가 설정되지 않았습니다.',
              'raw secret stack',
            ),
          ),
      }),
    ]);
    const response = await service.handleRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'sample.echo',
          arguments: {},
        },
      },
      { user },
    );
    const serializedResponse = JSON.stringify(response);

    expect(response).toMatchObject({
      error: {
        code: JSON_RPC_TOOL_ERROR,
        data: {
          errorCode: 'MISSING_YOUTUBE_API_KEY',
          errorMessage: 'YouTube API key가 설정되지 않았습니다.',
        },
      },
    });
    expect(serializedResponse).not.toContain('raw secret stack');
  });
});
