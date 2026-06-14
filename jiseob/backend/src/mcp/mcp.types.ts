import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

export type JsonRpcId = string | number | null;

export type JsonRpcSuccessResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcErrorResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: {
      errorCode: string;
      errorMessage: string;
    };
  };
};

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export type McpToolContext = {
  user: AuthenticatedUser;
};

export type JsonSchemaObject = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
  outputSchema?: JsonSchemaObject;
  readOnly: boolean;
};

export interface McpTool {
  readonly definition: McpToolDefinition;
  execute(args: unknown, context: McpToolContext): Promise<unknown>;
}

export const MCP_TOOLS = Symbol('MCP_TOOLS');
