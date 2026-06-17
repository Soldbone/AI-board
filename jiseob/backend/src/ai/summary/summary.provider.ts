export type SummaryThreadComment = {
  id: string;
  authorNickname: string;
  content: string;
  createdAt: Date;
  isRoot: boolean;
};

export type SummaryProviderInput = {
  rootCommentId: string;
  postId: string;
  mode: 'full' | 'incremental';
  previousSummaryText?: string;
  comments: SummaryThreadComment[];
  changeNote?: string;
};

export type SummaryProviderResult = {
  summaryText: string;
};

export type SummaryProviderErrorCode =
  | 'MISSING_OPENAI_API_KEY'
  | 'SUMMARY_PROVIDER_FAILED'
  | 'SUMMARY_PROVIDER_INVALID_RESPONSE';

export class SummaryProviderError extends Error {
  constructor(
    readonly code: SummaryProviderErrorCode,
    readonly userMessage: string,
    message?: string,
  ) {
    super(message ?? userMessage);
  }
}

export abstract class SummaryProvider {
  abstract summarize(input: SummaryProviderInput): Promise<SummaryProviderResult>;
}
