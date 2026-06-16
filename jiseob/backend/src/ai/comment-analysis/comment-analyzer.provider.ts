import { Injectable } from '@nestjs/common';
import { CommentType } from '../../common/enums/ai-status.enum';
import { ModerationStatus } from '../../common/enums/comment-status.enum';

export type CommentAnalysisResult = {
  commentType: CommentType;
  moderationStatus: ModerationStatus;
};

export type CommentAnalyzerErrorCode = 'COMMENT_ANALYSIS_FAILED';

export class CommentAnalyzerError extends Error {
  constructor(
    readonly code: CommentAnalyzerErrorCode,
    readonly userMessage: string,
    message?: string,
  ) {
    super(message ?? userMessage);
  }
}

export abstract class CommentAnalyzerProvider {
  abstract analyze(content: string): Promise<CommentAnalysisResult>;
}

const TOXIC_PATTERNS = ['바보', '멍청', '한심', '꺼져', '죽어', 'idiot', 'stupid', 'shut up'];

const FACT_CLAIM_PATTERNS = [
  /\d/,
  /%/,
  /년|월|일/,
  /통계|자료|연구|논문|보도|발표|조사|집계/,
  /조회수|구독자|매출|점유율|확률|평균/,
  /사실|실제로|기록|공식|정부|기관/,
  /(이다|했다|한다|됐다|된다|있다|없다)[.!]?$/,
];

const QUESTION_PATTERNS = [/\?/, /인가요|나요|습니까|까요|왜|어떻게|무엇|누구|언제/];

const OPINION_PATTERNS = [
  /생각|느낌|의견|개인적으로|아마|듯/,
  /좋다|싫다|별로|괜찮|재밌|재미있|멋지|아쉽/,
];

@Injectable()
export class RuleBasedCommentAnalyzerProvider implements CommentAnalyzerProvider {
  async analyze(content: string): Promise<CommentAnalysisResult> {
    const normalizedContent = content.trim().toLowerCase();

    if (!normalizedContent) {
      throw new CommentAnalyzerError(
        'COMMENT_ANALYSIS_FAILED',
        '댓글 분석에 필요한 내용이 비어 있습니다.',
      );
    }

    if (this.includesToxicPattern(normalizedContent)) {
      return {
        commentType: CommentType.TOXIC,
        moderationStatus: ModerationStatus.NEEDS_REVIEW,
      };
    }

    if (QUESTION_PATTERNS.some((pattern) => pattern.test(normalizedContent))) {
      return {
        commentType: CommentType.QUESTION,
        moderationStatus: ModerationStatus.NORMAL,
      };
    }

    if (FACT_CLAIM_PATTERNS.some((pattern) => pattern.test(normalizedContent))) {
      return {
        commentType: CommentType.FACT_CLAIM,
        moderationStatus: ModerationStatus.NORMAL,
      };
    }

    if (OPINION_PATTERNS.some((pattern) => pattern.test(normalizedContent))) {
      return {
        commentType: CommentType.OPINION,
        moderationStatus: ModerationStatus.NORMAL,
      };
    }

    return {
      commentType: CommentType.CHITCHAT,
      moderationStatus: ModerationStatus.NORMAL,
    };
  }

  private includesToxicPattern(content: string): boolean {
    return TOXIC_PATTERNS.some((pattern) => content.includes(pattern));
  }
}
