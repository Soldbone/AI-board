import { BadRequestException } from '@nestjs/common';

const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

export const extractYoutubeVideoId = (youtubeUrl: string): string => {
  let url: URL;

  try {
    url = new URL(youtubeUrl);
  } catch {
    throw new BadRequestException('YouTube URL 형식이 올바르지 않습니다.');
  }

  const hostname = url.hostname.toLowerCase();

  if (!YOUTUBE_HOSTS.has(hostname)) {
    throw new BadRequestException('지원하지 않는 YouTube URL입니다.');
  }

  const videoId = hostname === 'youtu.be' ? extractShortUrlId(url) : extractYoutubeComId(url);

  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    throw new BadRequestException('YouTube videoId를 추출할 수 없습니다.');
  }

  return videoId;
};

const extractShortUrlId = (url: URL): string | null => {
  const [videoId] = url.pathname.split('/').filter(Boolean);

  return videoId ?? null;
};

const extractYoutubeComId = (url: URL): string | null => {
  const watchVideoId = url.searchParams.get('v');

  if (watchVideoId) {
    return watchVideoId;
  }

  const [kind, videoId] = url.pathname.split('/').filter(Boolean);
  const supportedPathKinds = new Set(['shorts', 'embed', 'live']);

  if (kind && supportedPathKinds.has(kind)) {
    return videoId ?? null;
  }

  return null;
};
