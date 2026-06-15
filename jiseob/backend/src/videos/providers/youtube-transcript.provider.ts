import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ProviderError } from './provider-error';

const execFileAsync = promisify(execFile);

export type TranscriptSegment = {
  text: string;
  startTime: number;
  endTime: number;
};

export abstract class YoutubeTranscriptProvider {
  abstract fetchTranscript(
    youtubeVideoId: string,
    languages: string[],
  ): Promise<TranscriptSegment[]>;
}

type TranscriptCliSegment = {
  text?: string;
  start?: number;
  duration?: number;
};

@Injectable()
export class YoutubeTranscriptCliProvider implements YoutubeTranscriptProvider {
  constructor(private readonly configService: ConfigService) {}

  async fetchTranscript(youtubeVideoId: string, languages: string[]): Promise<TranscriptSegment[]> {
    const command =
      this.configService.get<string>('YOUTUBE_TRANSCRIPT_COMMAND') ?? 'youtube_transcript_api';

    try {
      const { stdout } = await execFileAsync(
        command,
        [youtubeVideoId, '--languages', ...languages, '--format', 'json'],
        {
          timeout: 60_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      const segments = this.parseSegments(stdout, youtubeVideoId);

      if (segments.length === 0) {
        throw new ProviderError(
          'TRANSCRIPT_NOT_AVAILABLE',
          '이 영상에서 사용할 수 있는 자막을 찾지 못했습니다.',
        );
      }

      return segments;
    } catch (error) {
      throw this.toTranscriptError(error);
    }
  }

  private parseSegments(stdout: string, youtubeVideoId: string): TranscriptSegment[] {
    const parsedOutput = JSON.parse(stdout) as unknown;
    const rawSegments = this.pickRawSegments(parsedOutput, youtubeVideoId);

    return rawSegments
      .map((segment) => {
        const text = segment.text?.trim();
        const startTime = segment.start;
        const duration = segment.duration;

        if (!text || typeof startTime !== 'number' || typeof duration !== 'number') {
          return null;
        }

        return {
          text,
          startTime,
          endTime: startTime + duration,
        };
      })
      .filter((segment): segment is TranscriptSegment => Boolean(segment));
  }

  private pickRawSegments(parsedOutput: unknown, youtubeVideoId: string): TranscriptCliSegment[] {
    if (Array.isArray(parsedOutput)) {
      const firstItem = parsedOutput[0];

      if (Array.isArray(firstItem)) {
        return firstItem as TranscriptCliSegment[];
      }

      return parsedOutput as TranscriptCliSegment[];
    }

    if (parsedOutput && typeof parsedOutput === 'object') {
      const outputObject = parsedOutput as Record<string, unknown>;
      const videoOutput = outputObject[youtubeVideoId] ?? Object.values(outputObject)[0];

      return Array.isArray(videoOutput) ? (videoOutput as TranscriptCliSegment[]) : [];
    }

    return [];
  }

  private toTranscriptError(error: unknown): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }

    const errorWithProcessOutput = error as {
      code?: string;
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    const rawMessage = [
      errorWithProcessOutput.stderr,
      errorWithProcessOutput.stdout,
      errorWithProcessOutput.message,
    ]
      .filter(Boolean)
      .join('\n');

    if (errorWithProcessOutput.code === 'ENOENT') {
      return new ProviderError(
        'MISSING_TRANSCRIPT_COMMAND',
        '자막 수집 명령을 실행할 수 없습니다. 서버 환경을 확인해주세요.',
        rawMessage,
      );
    }

    if (/RequestBlocked|IpBlocked/i.test(rawMessage)) {
      return new ProviderError(
        'TRANSCRIPT_PROVIDER_BLOCKED',
        'YouTube 자막 요청이 차단되었습니다. 잠시 후 다시 시도해주세요.',
        rawMessage,
      );
    }

    if (/NoTranscript|TranscriptsDisabled|No transcripts/i.test(rawMessage)) {
      return new ProviderError(
        'TRANSCRIPT_NOT_AVAILABLE',
        '이 영상에서 사용할 수 있는 자막을 찾지 못했습니다.',
        rawMessage,
      );
    }

    return new ProviderError(
      'TRANSCRIPT_PROVIDER_ERROR',
      'YouTube 자막을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.',
      rawMessage,
    );
  }
}
