import { HttpException, HttpStatus } from '@nestjs/common';
import { ProviderError } from '../videos/providers/provider-error';

export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const JSON_RPC_INTERNAL_ERROR = -32603;
export const JSON_RPC_TOOL_ERROR = -32000;

export class McpInvalidParamsError extends Error {
  readonly errorCode = 'INVALID_TOOL_ARGUMENTS';

  constructor(message = '도구 인자가 올바르지 않습니다.') {
    super(message);
  }
}

export class McpToolError extends Error {
  constructor(
    readonly errorCode: string,
    readonly userMessage: string,
  ) {
    super(userMessage);
  }
}

export const toJsonRpcToolError = (
  error: unknown,
): {
  code: number;
  message: string;
  data?: {
    errorCode: string;
    errorMessage: string;
  };
} => {
  if (error instanceof McpInvalidParamsError) {
    return {
      code: JSON_RPC_INVALID_PARAMS,
      message: 'Invalid params',
      data: {
        errorCode: error.errorCode,
        errorMessage: error.message,
      },
    };
  }

  if (error instanceof McpToolError) {
    return {
      code: JSON_RPC_TOOL_ERROR,
      message: error.userMessage,
      data: {
        errorCode: error.errorCode,
        errorMessage: error.userMessage,
      },
    };
  }

  if (error instanceof ProviderError) {
    return {
      code: JSON_RPC_TOOL_ERROR,
      message: error.userMessage,
      data: {
        errorCode: error.code,
        errorMessage: error.userMessage,
      },
    };
  }

  if (error instanceof HttpException) {
    const errorMessage = getHttpExceptionMessage(error);

    return {
      code: JSON_RPC_TOOL_ERROR,
      message: errorMessage,
      data: {
        errorCode: getHttpErrorCode(error.getStatus()),
        errorMessage,
      },
    };
  }

  return {
    code: JSON_RPC_INTERNAL_ERROR,
    message: 'Internal error',
    data: {
      errorCode: 'INTERNAL_ERROR',
      errorMessage: '도구 실행 중 오류가 발생했습니다.',
    },
  };
};

const getHttpExceptionMessage = (error: HttpException): string => {
  const response = error.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = (response as { message?: string | string[] }).message;

    if (Array.isArray(message)) {
      return message[0] ?? '요청을 처리할 수 없습니다.';
    }

    if (message) {
      return message;
    }
  }

  return error.message || '요청을 처리할 수 없습니다.';
};

const getHttpErrorCode = (status: number): string => {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    default:
      return 'TOOL_EXECUTION_FAILED';
  }
};
