import { apiRequest } from './client';
import type { RetryVideoProcessingResponse, Ulid, VideoResponse } from './types';

export function getVideo(videoId: Ulid) {
  return apiRequest<VideoResponse>(`/videos/${videoId}`);
}

export function retryVideoProcessing(videoId: Ulid) {
  return apiRequest<RetryVideoProcessingResponse>(`/videos/${videoId}/processing/retry`, {
    method: 'POST',
    auth: true,
    csrf: true,
  });
}
