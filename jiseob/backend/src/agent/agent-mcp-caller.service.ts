import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { JsonRpcResponse, McpToolCallResult, McpToolsListResult } from '../mcp/mcp.types';
import { McpServerService } from '../mcp/mcp-server.service';

export type AgentToolCallOutcome =
  | { ok: true; structuredContent: unknown; contentText: string }
  | { ok: false; errorCode: string; errorMessage: string };

const DEFAULT_TOOL_TIMEOUT_MS = 10000;

@Injectable()
export class AgentMcpCallerService {
  constructor(private readonly mcpServerService: McpServerService) {}

  async listTools(runId: string, user: AuthenticatedUser): Promise<string[]> {
    const response = await this.withTimeout(
      this.mcpServerService.handleRequest(
        {
          jsonrpc: '2.0',
          id: `${runId}:tools-list`,
          method: 'tools/list',
        },
        { user },
      ),
      DEFAULT_TOOL_TIMEOUT_MS,
    );

    if ('error' in response) {
      return [];
    }

    const result = response.result as Partial<McpToolsListResult>;

    return (result.tools ?? [])
      .map((tool) => tool.name)
      .filter((toolName): toolName is string => typeof toolName === 'string');
  }

  async callTool(
    runId: string,
    stepIndex: number,
    user: AuthenticatedUser,
    toolName: string,
    toolArguments: Record<string, unknown>,
    seenToolCalls: Set<string>,
  ): Promise<AgentToolCallOutcome> {
    const callKey = this.createCallKey(toolName, toolArguments);

    if (seenToolCalls.has(callKey)) {
      return {
        ok: false,
        errorCode: 'DUPLICATE_TOOL_CALL',
        errorMessage: '같은 도구와 인자를 반복 호출할 수 없습니다.',
      };
    }

    seenToolCalls.add(callKey);

    try {
      const response = await this.withTimeout(
        this.mcpServerService.handleRequest(
          {
            jsonrpc: '2.0',
            id: `${runId}:${stepIndex}`,
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: toolArguments,
            },
          },
          { user },
        ),
        DEFAULT_TOOL_TIMEOUT_MS,
      );

      return this.unwrapResponse(response);
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return {
          ok: false,
          errorCode: 'TOOL_TIMEOUT',
          errorMessage: '도구 실행 시간이 초과되었습니다.',
        };
      }

      return {
        ok: false,
        errorCode: 'TOOL_CALL_FAILED',
        errorMessage: '도구 호출 중 오류가 발생했습니다.',
      };
    }
  }

  private unwrapResponse(response: JsonRpcResponse): AgentToolCallOutcome {
    if ('error' in response) {
      return {
        ok: false,
        errorCode: response.error.data?.errorCode ?? 'JSON_RPC_ERROR',
        errorMessage: response.error.data?.errorMessage ?? response.error.message,
      };
    }

    const result = response.result as Partial<McpToolCallResult>;

    if (result.isError) {
      const errorContent = this.toErrorContent(result.structuredContent);

      return {
        ok: false,
        errorCode: errorContent.errorCode,
        errorMessage: errorContent.errorMessage,
      };
    }

    return {
      ok: true,
      structuredContent: result.structuredContent,
      contentText: result.content?.map((item) => item.text).join('\n') ?? '',
    };
  }

  private toErrorContent(value: unknown): { errorCode: string; errorMessage: string } {
    if (this.isRecord(value)) {
      return {
        errorCode: typeof value.errorCode === 'string' ? value.errorCode : 'TOOL_ERROR',
        errorMessage:
          typeof value.errorMessage === 'string'
            ? value.errorMessage
            : '도구 실행 중 오류가 발생했습니다.',
      };
    }

    return {
      errorCode: 'TOOL_ERROR',
      errorMessage: '도구 실행 중 오류가 발생했습니다.',
    };
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        const error = new Error('Operation timed out');

        error.name = 'TimeoutError';
        reject(error);
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private createCallKey(toolName: string, toolArguments: Record<string, unknown>): string {
    return `${toolName}:${this.stableStringify(toolArguments)}`;
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    if (this.isRecord(value)) {
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`)
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
