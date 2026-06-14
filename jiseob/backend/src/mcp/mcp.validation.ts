import { McpInvalidParamsError } from './mcp.errors';

export const assertPlainObject = (
  value: unknown,
  target = 'arguments',
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new McpInvalidParamsError(`${target}는 객체여야 합니다.`);
  }

  return value as Record<string, unknown>;
};

export const readRequiredString = (
  source: Record<string, unknown>,
  key: string,
  options: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
  } = {},
): string => {
  const value = source[key];

  if (typeof value !== 'string') {
    throw new McpInvalidParamsError(`${key}는 문자열이어야 합니다.`);
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length < (options.minLength ?? 1)) {
    throw new McpInvalidParamsError(`${key}는 비어 있을 수 없습니다.`);
  }

  if (options.maxLength !== undefined && trimmedValue.length > options.maxLength) {
    throw new McpInvalidParamsError(`${key}가 너무 깁니다.`);
  }

  if (options.pattern && !options.pattern.test(trimmedValue)) {
    throw new McpInvalidParamsError(`${key} 형식이 올바르지 않습니다.`);
  }

  return trimmedValue;
};

export const readOptionalInteger = (
  source: Record<string, unknown>,
  key: string,
  options: {
    defaultValue: number;
    min: number;
    max: number;
  },
): number => {
  const value = source[key];

  if (value === undefined || value === null) {
    return options.defaultValue;
  }

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new McpInvalidParamsError(`${key}는 정수여야 합니다.`);
  }

  if (value < options.min || value > options.max) {
    throw new McpInvalidParamsError(`${key}는 ${options.min} 이상 ${options.max} 이하여야 합니다.`);
  }

  return value;
};
