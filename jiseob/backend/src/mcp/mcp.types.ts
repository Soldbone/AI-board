import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

export type JsonRpcId = string | number;
export type JsonRpcErrorId = JsonRpcId | null;

export type JsonRpcSuccessResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcErrorResponse = {
  jsonrpc: '2.0';
  id: JsonRpcErrorId;
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
  title?: string;
  description: string;
  inputSchema: JsonSchemaObject;
  outputSchema?: JsonSchemaObject;
  readOnly: boolean;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export type McpToolListDefinition = McpToolDefinition & {
  annotations: {
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export type McpToolsListResult = {
  tools: McpToolListDefinition[];
};

export type McpTextContent = {
  type: 'text';
  text: string;
};

export type McpToolCallResult = {
  content: McpTextContent[];
  structuredContent: unknown;
  isError: boolean;
};

export interface McpTool {
  readonly definition: McpToolDefinition;
  execute(args: unknown, context: McpToolContext): Promise<unknown>;
}

export const MCP_TOOLS = Symbol('MCP_TOOLS');
