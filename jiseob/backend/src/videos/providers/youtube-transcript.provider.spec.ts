import { ConfigService } from '@nestjs/config';
import { TranscriptSegment, YoutubeTranscriptCliProvider } from './youtube-transcript.provider';

describe('YoutubeTranscriptCliProvider', () => {
  const provider = new YoutubeTranscriptCliProvider({
    get: jest.fn(),
  } as unknown as ConfigService);
  const parseSegments = (stdout: string, youtubeVideoId = 'dQw4w9WgXcQ') =>
    (
      provider as unknown as {
        parseSegments(stdout: string, youtubeVideoId: string): TranscriptSegment[];
      }
    ).parseSegments(stdout, youtubeVideoId);

  it('parses flat transcript CLI output', () => {
    expect(
      parseSegments(
        JSON.stringify([
          {
            text: ' hello ',
            start: 1,
            duration: 2,
          },
        ]),
      ),
    ).toEqual([
      {
        text: 'hello',
        startTime: 1,
        endTime: 3,
      },
    ]);
  });

  it('parses batch transcript CLI output wrapped in an outer array', () => {
    expect(
      parseSegments(
        JSON.stringify([
          [
            {
              text: 'available transcript',
              start: 10,
              duration: 2.5,
            },
          ],
        ]),
      ),
    ).toEqual([
      {
        text: 'available transcript',
        startTime: 10,
        endTime: 12.5,
      },
    ]);
  });

  it('parses object keyed transcript CLI output', () => {
    expect(
      parseSegments(
        JSON.stringify({
          dQw4w9WgXcQ: [
            {
              text: 'keyed transcript',
              start: 3,
              duration: 4,
            },
          ],
        }),
      ),
    ).toEqual([
      {
        text: 'keyed transcript',
        startTime: 3,
        endTime: 7,
      },
    ]);
  });
});
