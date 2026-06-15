export type Ulid = string;
export type IsoDateString = string;

export type UserRole = 'ADMIN' | 'USER';

export type VideoProcessingStatus =
  | 'FAILED'
  | 'NOT_AVAILABLE'
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS';

export type AiAnalysisStatus = 'FAILED' | 'NOT_REQUIRED' | 'PENDING' | 'PROCESSING' | 'SUCCESS';

export type RagStatus =
  | 'FAILED'
  | 'NO_RESULT'
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS';

export type CommentType = 'FACT_CLAIM' | 'OPINION' | 'QUESTION' | 'TOXIC';

export type ModerationStatus = 'DELETED_BY_ADMIN' | 'NEEDS_REVIEW' | 'NORMAL';

export type AgentRunStatus = 'FAILED' | 'PENDING' | 'RUNNING' | 'SUCCESS';

export type SummaryStatus = 'FAILED' | 'PENDING' | 'PROCESSING' | 'SUCCESS';

export type PostSort = 'latest' | 'comments' | 'likes' | 'views';

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedResponse<TItem> = {
  items: TItem[];
  meta: PaginationMeta;
};

export type UserResponse = {
  id: Ulid;
  email: string;
  nickname: string;
  role: UserRole;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
};

export type SignupRequest = {
  email: string;
  password: string;
  nickname: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
  user: UserResponse;
};

export type RefreshResponse = {
  accessToken: string;
  csrfToken: string;
};

export type CsrfResponse = {
  csrfToken: string;
};

export type TagResponse = {
  id: Ulid;
  name: string;
};

export type PostAuthor = {
  id: Ulid;
  nickname: string;
};

export type VideoSummaryResponse = {
  id: Ulid;
  youtubeVideoId: string;
  metadataStatus: VideoProcessingStatus;
  transcriptStatus: VideoProcessingStatus;
  embeddingStatus: VideoProcessingStatus;
  isProcessing: boolean;
};

export type VideoResponse = VideoSummaryResponse & {
  youtubeUrl: string;
  title: string | null;
  channelName: string | null;
  thumbnailUrl: string | null;
  publishedAt: IsoDateString | null;
  description: string | null;
  youtubeViewCount: number | null;
  youtubeLikeCount: number | null;
  youtubeCommentCount: number | null;
  metadataErrorCode: string | null;
  metadataErrorMessage: string | null;
  transcriptErrorCode: string | null;
  transcriptErrorMessage: string | null;
  embeddingErrorCode: string | null;
  embeddingErrorMessage: string | null;
  processedAt: IsoDateString | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
};

export type PostListItemResponse = {
  id: Ulid;
  title: string;
  contentPreview: string;
  youtubeUrl: string;
  commentCount: number;
  viewCount: number;
  likeCount: number;
  likedByMe: boolean | null;
  author: PostAuthor;
  video: VideoSummaryResponse;
  tags: TagResponse[];
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
};

export type PostResponse = PostListItemResponse & {
  content: string;
};

export type ListPostsQuery = {
  page?: number;
  limit?: number;
  q?: string;
  tag?: string;
  sort?: PostSort;
};

export type CreatePostRequest = {
  title: string;
  content: string;
  youtubeUrl: string;
  tags: string[];
};

export type UpdatePostRequest = {
  title?: string;
  content?: string;
  tags?: string[];
};

export type PostViewResponse = {
  viewCount: number;
};

export type LikePostResponse = {
  likeCount: number;
};

export type CommentAnalysisResponse = {
  commentType: CommentType | null;
  aiAnalysisStatus: AiAnalysisStatus;
  ragStatus: RagStatus;
  evidenceCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  analyzedAt: IsoDateString | null;
};

export type CommentResponse = {
  id: Ulid;
  postId: Ulid;
  parentCommentId: Ulid | null;
  content: string;
  moderationStatus: ModerationStatus;
  analysis: CommentAnalysisResponse | null;
  isDeleted: boolean;
  author: PostAuthor;
  replies: CommentResponse[];
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
};

export type CreateCommentRequest = {
  content: string;
};

export type UpdateCommentRequest = {
  content: string;
};

export type EvidenceResponse = {
  id: Ulid;
  transcriptChunkId: Ulid;
  evidenceText: string;
  similarityScore: number;
  startTime: number | null;
  endTime: number | null;
  createdAt: IsoDateString;
};

export type CommentEvidencesResponse = {
  commentId: Ulid;
  ragStatus: RagStatus;
  evidenceCount: number;
  ragErrorCode: string | null;
  ragErrorMessage: string | null;
  evidences: EvidenceResponse[];
};

export type SummaryResponse = {
  summaryId: Ulid;
  rootCommentId: Ulid;
  postId: Ulid;
  status: SummaryStatus;
  summaryText: string | null;
  summarizedCommentCount: number;
  currentCommentCount: number;
  isStale: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  generatedAt: IsoDateString | null;
};

export type RetryVideoProcessingResponse = {
  videoId: Ulid;
  accepted: boolean;
};

export type CreateAgentRunRequest = {
  question: string;
};

export type CreateAgentRunResponse = {
  runId: Ulid;
  postId: Ulid;
  status: AgentRunStatus;
  question: string;
  createdAt: IsoDateString;
};

export type AgentToolUseResponse = {
  stepIndex: number;
  toolName: string;
  status: AgentRunStatus;
};

export type AgentEvidenceCandidateResponse = {
  chunkId: Ulid;
  startSec: number | null;
  endSec: number | null;
  text: string;
  similarityScore: number;
};

export type AgentRunResponse = CreateAgentRunResponse & {
  answer: string | null;
  usedTools: AgentToolUseResponse[];
  evidenceCandidates: AgentEvidenceCandidateResponse[];
  limitations: string[];
  errorCode: string | null;
  errorMessage: string | null;
  stepCount: number;
  startedAt: IsoDateString | null;
  completedAt: IsoDateString | null;
};

export type AdminCommentResponse = Omit<CommentResponse, 'isDeleted' | 'replies'>;

export type ListAdminCommentsQuery = {
  moderationStatus?: ModerationStatus;
  page?: number;
  limit?: number;
};

export type RetryCommentAnalysisResponse = {
  commentId: Ulid;
  accepted: boolean;
  aiAnalysisStatus: AiAnalysisStatus;
};
