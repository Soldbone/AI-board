import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscriptSegment } from './providers/youtube-transcript.provider';

export type TranscriptChunkInput = {
  chunkIndex: number;
  content: string;
  startTime: number | null;
  endTime: number | null;
};

type SegmentRange = {
  startChar: number;
  endChar: number;
  startTime: number;
  endTime: number;
};

@Injectable()
export class TranscriptChunkingService {
  constructor(private readonly configService: ConfigService) {}

  createChunks(segments: TranscriptSegment[]): TranscriptChunkInput[] {
    const chunkSize = this.getPositiveConfigValue('TRANSCRIPT_CHUNK_SIZE', 1000);
    const configuredOverlap = this.getPositiveConfigValue('TRANSCRIPT_CHUNK_OVERLAP', 200);
    const overlap = Math.min(configuredOverlap, chunkSize - 1);
    const { content, ranges } = this.joinSegments(segments);
    const chunks: TranscriptChunkInput[] = [];

    if (!content) {
      return chunks;
    }

    let startChar = 0;

    while (startChar < content.length) {
      const endChar = Math.min(startChar + chunkSize, content.length);
      const chunkContent = content.slice(startChar, endChar).trim();

      if (chunkContent) {
        chunks.push({
          chunkIndex: chunks.length,
          content: chunkContent,
          startTime: this.findStartTime(ranges, startChar),
          endTime: this.findEndTime(ranges, endChar),
        });
      }

      if (endChar >= content.length) {
        break;
      }

      startChar = Math.max(endChar - overlap, startChar + 1);
    }

    return chunks;
  }

  private joinSegments(segments: TranscriptSegment[]): {
    content: string;
    ranges: SegmentRange[];
  } {
    let content = '';
    const ranges: SegmentRange[] = [];

    for (const segment of segments) {
      const text = segment.text.trim();

      if (!text) {
        continue;
      }

      if (content.length > 0) {
        content += ' ';
      }

      const startChar = content.length;
      content += text;
      ranges.push({
        startChar,
        endChar: content.length,
        startTime: segment.startTime,
        endTime: segment.endTime,
      });
    }

    return { content, ranges };
  }

  private findStartTime(ranges: SegmentRange[], startChar: number): number | null {
    const range = ranges.find((candidate) => candidate.endChar > startChar);

    return range?.startTime ?? null;
  }

  private findEndTime(ranges: SegmentRange[], endChar: number): number | null {
    for (let index = ranges.length - 1; index >= 0; index -= 1) {
      const range = ranges[index];

      if (range.startChar < endChar) {
        return range.endTime;
      }
    }

    return null;
  }

  private getPositiveConfigValue(name: string, fallback: number): number {
    const parsedValue = Number(this.configService.get<string>(name) ?? fallback);

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
  }
}
