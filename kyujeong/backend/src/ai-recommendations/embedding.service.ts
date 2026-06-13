import { Injectable } from '@nestjs/common';

const LOCAL_EMBEDDING_DIMENSION = 96;

@Injectable()
export class EmbeddingService {
  async embed(text: string) {
    const openAiApiKey = process.env.OPENAI_API_KEY;

    if (openAiApiKey) {
      const embedding = await this.createOpenAiEmbedding(text, openAiApiKey);

      if (embedding.length > 0) {
        return {
          model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
          embedding,
        };
      }
    }

    return {
      model: 'local-hash-v1',
      embedding: this.createLocalEmbedding(text),
    };
  }

  cosineSimilarity(firstEmbedding: number[], secondEmbedding: number[]) {
    const dimension = Math.min(firstEmbedding.length, secondEmbedding.length);
    let dotProduct = 0;
    let firstMagnitude = 0;
    let secondMagnitude = 0;

    for (let index = 0; index < dimension; index += 1) {
      const firstValue = firstEmbedding[index] ?? 0;
      const secondValue = secondEmbedding[index] ?? 0;

      dotProduct += firstValue * secondValue;
      firstMagnitude += firstValue * firstValue;
      secondMagnitude += secondValue * secondValue;
    }

    if (firstMagnitude === 0 || secondMagnitude === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude));
  }

  private async createOpenAiEmbedding(text: string, openAiApiKey: string) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
          input: text.slice(0, 7000),
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };

      return data.data?.[0]?.embedding ?? [];
    } catch {
      return [];
    }
  }

  private createLocalEmbedding(text: string) {
    const vector = Array.from({ length: LOCAL_EMBEDDING_DIMENSION }, () => 0);
    const normalizedTokens = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s,#]/gu, ' ')
      .split(/[\s,#]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1);

    normalizedTokens.forEach((token) => {
      const hash = this.hashToken(token);
      const index = Math.abs(hash) % LOCAL_EMBEDDING_DIMENSION;

      vector[index] += 1;
    });

    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );

    if (magnitude === 0) {
      return vector;
    }

    return vector.map((value) => value / magnitude);
  }

  private hashToken(token: string) {
    let hash = 0;

    for (let index = 0; index < token.length; index += 1) {
      hash = (hash << 5) - hash + token.charCodeAt(index);
      hash |= 0;
    }

    return hash;
  }
}
