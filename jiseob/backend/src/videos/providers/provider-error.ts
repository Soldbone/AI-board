export type ProviderErrorCode =
  | 'MISSING_YOUTUBE_API_KEY'
  | 'YOUTUBE_API_ERROR'
  | 'YOUTUBE_VIDEO_NOT_FOUND'
  | 'MISSING_TRANSCRIPT_COMMAND'
  | 'TRANSCRIPT_NOT_AVAILABLE'
  | 'TRANSCRIPT_PROVIDER_BLOCKED'
  | 'TRANSCRIPT_PROVIDER_ERROR'
  | 'MISSING_OPENAI_API_KEY'
  | 'OPENAI_API_ERROR'
  | 'TRANSCRIPT_REQUIRED';

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly userMessage: string,
    message?: string,
  ) {
    super(message ?? userMessage);
  }
}

export const toProviderError = (
  error: unknown,
  fallbackCode: ProviderErrorCode,
  fallbackMessage: string,
): ProviderError => {
  if (error instanceof ProviderError) {
    return error;
  }

  return new ProviderError(
    fallbackCode,
    fallbackMessage,
    error instanceof Error ? error.message : undefined,
  );
};
