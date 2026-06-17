import { BadRequestException } from '@nestjs/common';
import { extractYoutubeVideoId } from './youtube-url.util';

describe('extractYoutubeVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('extracts the video id from %s', (url, expectedVideoId) => {
    expect(extractYoutubeVideoId(url)).toBe(expectedVideoId);
  });

  it.each([
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=short',
    'not-a-url',
  ])('rejects an invalid YouTube URL: %s', (url) => {
    expect(() => extractYoutubeVideoId(url)).toThrow(BadRequestException);
  });
});
