import { ConfigService } from '@nestjs/config';
import { TranscriptChunkingService } from './transcript-chunking.service';

describe('TranscriptChunkingService', () => {
  it('creates overlapping transcript chunks based on configured character sizes', () => {
    const service = new TranscriptChunkingService({
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          TRANSCRIPT_CHUNK_SIZE: '10',
          TRANSCRIPT_CHUNK_OVERLAP: '3',
        };

        return values[key];
      }),
    } as unknown as ConfigService);

    const chunks = service.createChunks([
      {
        text: 'abcdefghij',
        startTime: 0,
        endTime: 1,
      },
      {
        text: 'klmnopqrst',
        startTime: 1,
        endTime: 2,
      },
    ]);

    expect(chunks.map((chunk) => chunk.content)).toEqual(['abcdefghij', 'hij klmnop', 'nopqrst']);
    expect(chunks[1].startTime).toBe(0);
    expect(chunks[1].endTime).toBe(2);
  });
});
