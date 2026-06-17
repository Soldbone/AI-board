import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderError } from './provider-error';

export abstract class EmbeddingProvider {
  abstract embedTexts(texts: string[]): Promise<number[][]>;
}

type OpenAiEmbeddingsResponse = {
  error?: {
    message?: string;
  };
  data?: Array<{
    embedding?: number[];
  }>;
};

const OPENAI_EMBEDDING_TIMEOUT_MS = 30_000;

@Injectable()
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly configService: ConfigService) {}

  async embedTexts(texts: string[]): Promise<number[][]> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new ProviderError(
        'MISSING_OPENAI_API_KEY',
        'OpenAI API key가 설정되지 않아 임베딩을 생성하지 못했습니다.',
      );
    }

    if (texts.length === 0) {
      return [];
    }

    const model = this.configService.get<string>('EMBEDDING_MODEL') ?? 'text-embedding-3-small';
    const dimension = Number(this.configService.get<string>('EMBEDDING_DIMENSION') ?? '1536');
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      signal: AbortSignal.timeout(OPENAI_EMBEDDING_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: texts,
        dimensions: dimension,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as OpenAiEmbeddingsResponse;

    if (!response.ok) {
      throw new ProviderError(
        'OPENAI_API_ERROR',
        '자막 임베딩을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.',
        body.error?.message,
      );
    }

    const embeddings = body.data?.map((item) => item.embedding).filter(this.isEmbedding) ?? [];

    if (embeddings.length !== texts.length) {
      throw new ProviderError(
        'OPENAI_API_ERROR',
        '자막 임베딩 응답 형식이 올바르지 않습니다.',
        `Expected ${texts.length} embeddings but received ${embeddings.length}`,
      );
    }

    return embeddings;
  }

  private isEmbedding(value: number[] | undefined): value is number[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'number');
  }
}
