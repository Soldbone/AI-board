export enum CommentType {
  FACT_CLAIM = 'FACT_CLAIM',
  OPINION = 'OPINION',
  QUESTION = 'QUESTION',
  TOXIC = 'TOXIC',
  CHITCHAT = 'CHITCHAT',
}

export enum AiAnalysisStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum RagStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  NO_RESULT = 'NO_RESULT',
}

export enum SummaryStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum SummaryTargetType {
  COMMENT_THREAD = 'COMMENT_THREAD',
  POST = 'POST',
}
