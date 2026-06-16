import { apiRequest } from './client';
import type {
  AgentRunResponse,
  CreateAgentRunRequest,
  CreateAgentRunResponse,
  Ulid,
} from './types';

export function createAgentRun(postId: Ulid, body: CreateAgentRunRequest) {
  return apiRequest<CreateAgentRunResponse>(`/posts/${postId}/agent/runs`, {
    method: 'POST',
    body,
    auth: true,
    csrf: true,
  });
}

export function getAgentRun(runId: Ulid) {
  return apiRequest<AgentRunResponse>(`/agent/runs/${runId}`, {
    auth: true,
  });
}
