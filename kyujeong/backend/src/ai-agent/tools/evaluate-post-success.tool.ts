import { Injectable } from '@nestjs/common';
import type {
  DraftSignals,
  PostDraftAgentInput,
  PostQualityCheck,
  PostSuccessPlan,
} from '../post-draft-agent.types';

export type EvaluatePostSuccessInput = {
  draft: PostDraftAgentInput;
  ingredients: string[];
  signals: DraftSignals;
  nutritionSummary: string | null;
};

@Injectable()
export class EvaluatePostSuccessTool {
  run(input: EvaluatePostSuccessInput): PostSuccessPlan {
    const checks = this.buildChecks(input);
    const score = this.calculateScore(checks);
    const level = score >= 80 ? 'strong' : score >= 55 ? 'needs_work' : 'weak';

    return {
      score,
      level,
      summary: this.buildSummary(level, checks),
      checks,
      expectedComments: this.buildExpectedComments(input),
      engagementQuestions: this.buildEngagementQuestions(input),
    };
  }

  private buildChecks(input: EvaluatePostSuccessInput): PostQualityCheck[] {
    return [
      {
        label: '재료 명확도',
        status:
          input.ingredients.length >= 3
            ? 'good'
            : input.ingredients.length >= 2
              ? 'warning'
              : 'missing',
        detail:
          input.ingredients.length >= 3
            ? '댓글 작성자가 바로 조합을 떠올릴 만큼 재료가 구체적입니다.'
            : input.ingredients.length >= 2
              ? '기본 추천은 가능하지만 재료가 하나 더 있으면 선택지가 넓어집니다.'
              : '재료가 부족해서 댓글이 일반적인 추천으로 흐를 가능성이 큽니다.',
      },
      {
        label: '조리 시간',
        status: input.signals.timePreference ? 'good' : 'missing',
        detail: input.signals.timePreference
          ? `${input.signals.timePreference} 조건이 있어 답변 범위가 좁아집니다.`
          : '조리 시간이 없으면 빠른 메뉴와 정성 메뉴가 섞여 댓글 품질이 떨어질 수 있습니다.',
      },
      {
        label: '식사 상황',
        status: input.signals.mealContext ? 'good' : 'warning',
        detail: input.signals.mealContext
          ? `${input.signals.mealContext} 상황이 드러나 추천 기준이 분명합니다.`
          : '아침, 저녁, 도시락 같은 상황을 넣으면 더 맞는 댓글을 받기 쉽습니다.',
      },
      {
        label: '취향 조건',
        status: input.signals.tastePreference ? 'good' : 'warning',
        detail: input.signals.tastePreference
          ? `${input.signals.tastePreference} 조건이 있어 양념 방향을 잡기 좋습니다.`
          : '매운맛, 담백함, 저염 같은 취향을 넣으면 답변이 덜 뻔해집니다.',
      },
      {
        label: 'MCP 근거',
        status: input.nutritionSummary ? 'good' : 'warning',
        detail: input.nutritionSummary
          ? '식재료 메타데이터를 바탕으로 게시글 조건을 보강할 수 있습니다.'
          : '영양성분 근거 없이도 작성은 가능하지만, 차별점은 약해집니다.',
      },
    ];
  }

  private calculateScore(checks: PostQualityCheck[]) {
    const score = checks.reduce((sum, check) => {
      if (check.status === 'good') {
        return sum + 20;
      }

      if (check.status === 'warning') {
        return sum + 12;
      }

      return sum + 0;
    }, 0);

    return Math.min(100, score);
  }

  private buildSummary(
    level: PostSuccessPlan['level'],
    checks: PostQualityCheck[],
  ) {
    const missingLabels = checks
      .filter((check) => check.status === 'missing')
      .map((check) => check.label);
    const warningLabels = checks
      .filter((check) => check.status === 'warning')
      .map((check) => check.label);

    if (level === 'strong') {
      return '댓글이 구체적으로 달릴 가능성이 높은 게시글입니다. 마지막에 선택지를 묻는 문장을 넣으면 더 좋아집니다.';
    }

    if (missingLabels.length > 0) {
      return `${missingLabels.join(', ')} 정보가 부족해서 댓글이 단순해질 수 있습니다.`;
    }

    return `${warningLabels.join(', ')}를 조금만 보강하면 더 좋은 추천 댓글을 받을 수 있습니다.`;
  }

  private buildExpectedComments(input: EvaluatePostSuccessInput) {
    const primary = input.ingredients[0] ?? '남은 재료';
    const second = input.ingredients[1] ?? '기본 재료';
    const time = input.signals.timePreference ?? '짧은 시간';

    return [
      `${primary}${second ? `, ${second}` : ''}면 간단한 볶음류를 추천하는 댓글이 달릴 가능성이 높아요.`,
      `${time} 조건 때문에 손이 덜 가는 메뉴 위주로 답변이 모일 수 있어요.`,
      input.signals.tastePreference
        ? `${input.signals.tastePreference} 조건에 맞춘 양념 조절 댓글이 나올 수 있어요.`
        : '취향 조건이 없으면 김치볶음밥처럼 뻔한 답변이 먼저 달릴 수 있어요.',
    ];
  }

  private buildEngagementQuestions(input: EvaluatePostSuccessInput) {
    const primary = input.ingredients[0] ?? '이 재료';
    const questions = [
      `여러분이라면 ${primary}로 가장 먼저 뭐 해드세요?`,
      '추가 재료를 하나만 산다면 뭘 사는 게 좋을까요?',
    ];

    if (input.signals.timePreference) {
      questions.push(`${input.signals.timePreference} 안에 가능한 조리법이면 더 좋아요.`);
    }

    if (input.nutritionSummary?.includes('나트륨')) {
      questions.push('간을 세게 하지 않는 방법도 같이 알려주세요.');
    }

    return questions.slice(0, 3);
  }
}
