import { Inject, Injectable } from '@nestjs/common';
import {
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  McpToolErrorContent,
  toMcpToolErrorContent,
} from './mcp.errors';
import {
  JsonRpcErrorId,
  JsonRpcId,
  JsonRpcResponse,
  MCP_TOOLS,
  McpToolCallResult,
  McpTool,
  McpToolContext,
  McpToolDefinition,
  McpToolListDefinition,
  McpToolsListResult,
} from './mcp.types';

type JsonRpcRequestRecord = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

@Injectable()
export class McpServerService {
  private readonly toolsByName: Map<string, McpTool>;

  constructor(@Inject(MCP_TOOLS) tools: McpTool[]) {
    this.toolsByName = new Map(tools.map((tool) => [tool.definition.name, tool]));
  }

  async handleRequest(body: unknown, context: McpToolContext): Promise<JsonRpcResponse> {
    if (!this.isRecord(body)) {
      return this.error(null, JSON_RPC_INVALID_REQUEST, 'Invalid Request', {
        errorCode: 'INVALID_JSON_RPC_REQUEST',
        errorMessage: 'JSON-RPC 요청은 객체여야 합니다.',
      });
    }

    const request = body as JsonRpcRequestRecord;
    const id = this.extractId(request.id);

    if (id === null) {
      return this.error(null, JSON_RPC_INVALID_REQUEST, 'Invalid Request', {
        errorCode: 'INVALID_JSON_RPC_ID',
        errorMessage: 'JSON-RPC id는 string 또는 number여야 합니다.',
      });
    }

    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return this.error(id, JSON_RPC_INVALID_REQUEST, 'Invalid Request', {
        errorCode: 'INVALID_JSON_RPC_REQUEST',
        errorMessage: 'JSON-RPC 2.0 요청 형식이 올바르지 않습니다.',
      });
    }

    switch (request.method) {
      case 'tools/list':
        return this.success(id, this.listTools());
      case 'tools/call':
        return this.callTool(id, request.params, context);
      default:
        return this.error(id, JSON_RPC_METHOD_NOT_FOUND, 'Method not found', {
          errorCode: 'METHOD_NOT_FOUND',
          errorMessage: '지원하지 않는 JSON-RPC method입니다.',
        });
    }
  }

  listTools(): McpToolsListResult {
    return {
      tools: this.getToolDefinitions().map((tool) => this.toListToolDefinition(tool)),
    };
  }

  private async callTool(
    id: JsonRpcId,
    params: unknown,
    context: McpToolContext,
  ): Promise<JsonRpcResponse> {
    if (!this.isRecord(params)) {
      return this.error(id, JSON_RPC_INVALID_PARAMS, 'Invalid params', {
        errorCode: 'INVALID_TOOL_CALL_PARAMS',
        errorMessage: 'tools/call params는 객체여야 합니다.',
      });
    }

    const toolName = params.name;
    const toolArguments = params.arguments ?? {};

    if (typeof toolName !== 'string') {
      return this.error(id, JSON_RPC_INVALID_PARAMS, 'Invalid params', {
        errorCode: 'INVALID_TOOL_NAME',
        errorMessage: 'tool name은 문자열이어야 합니다.',
      });
    }

    const tool = this.toolsByName.get(toolName);

    if (!tool) {
      return this.error(id, JSON_RPC_INVALID_PARAMS, 'Invalid params', {
        errorCode: 'TOOL_NOT_FOUND',
        errorMessage: '등록되지 않은 MCP tool입니다.',
      });
    }

    try {
      const result = await tool.execute(toolArguments, context);

      return this.success(id, this.wrapToolResult(result));
    } catch (error) {
      return this.success(id, this.wrapToolErrorResult(toMcpToolErrorContent(error)));
    }
  }

  private success(id: JsonRpcId, result: unknown): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  private error(
    id: JsonRpcErrorId,
    code: number,
    message: string,
    data?: {
      errorCode: string;
      errorMessage: string;
    },
  ): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data ? { data } : {}),
      },
    };
  }

  private wrapToolResult(structuredContent: unknown): McpToolCallResult {
    const text = this.stringifyStructuredContent(structuredContent);

    if (text === null) {
      return this.wrapToolErrorResult({
        errorCode: 'TOOL_RESULT_SERIALIZATION_FAILED',
        errorMessage: '도구 실행 결과를 직렬화하지 못했습니다.',
      });
    }

    return {
      content: [
        {
          type: 'text',
          text,
        },
      ],
      structuredContent,
      isError: false,
    };
  }

  private wrapToolErrorResult(errorContent: McpToolErrorContent): McpToolCallResult {
    return {
      content: [
        {
          type: 'text',
          text: errorContent.errorMessage,
        },
      ],
      structuredContent: errorContent,
      isError: true,
    };
  }

  private stringifyStructuredContent(structuredContent: unknown): string | null {
    try {
      return JSON.stringify(structuredContent) ?? 'null';
    } catch {
      return null;
    }
  }

  private toListToolDefinition(tool: McpToolDefinition): McpToolListDefinition {
    return {
      ...tool,
      annotations: {
        ...tool.annotations,
        readOnlyHint: tool.annotations?.readOnlyHint ?? tool.readOnly,
      },
    };
  }

  private getToolDefinitions(): McpToolDefinition[] {
    return [...this.toolsByName.values()].map((tool) => tool.definition);
  }

  private extractId(id: unknown): JsonRpcId | null {
    if (typeof id === 'string') {
      return id;
    }

    if (typeof id === 'number' && Number.isFinite(id)) {
      return id;
    }

    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
