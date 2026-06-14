import { Injectable } from '@nestjs/common';
import { AnalyzeFoodMetadataTool } from './tools/analyze-food-metadata.tool';
import { ExtractIngredientsTool } from './tools/extract-ingredients.tool';
import { RewritePostDraftTool } from './tools/rewrite-post-draft.tool';
import { EvaluatePostSuccessTool } from './tools/evaluate-post-success.tool';
import type {
  PostDraftAgentInput,
  PostDraftAgentResponse,
  PostDraftAgentState,
} from './post-draft-agent.types';

@Injectable()
export class PostDraftAgentRunner {
  private readonly maxSteps = 7;
  private readonly maxToolCallsPerTool = 1;

  constructor(
    private readonly extractIngredientsTool: ExtractIngredientsTool,
    private readonly analyzeFoodMetadataTool: AnalyzeFoodMetadataTool,
    private readonly evaluatePostSuccessTool: EvaluatePostSuccessTool,
    private readonly rewritePostDraftTool: RewritePostDraftTool,
  ) {}

  async run(input: PostDraftAgentInput): Promise<PostDraftAgentResponse> {
    let state = this.createInitialState(input);

    state = this.runNode(state, 'analyze_request', (currentState) =>
      this.analyzeRequest(currentState),
    );

    if (state.missingInfoQuestions.length > 0) {
      state = this.runNode(state, 'ask_followup_questions', (currentState) => ({
        ...currentState,
        status: 'needs_input',
      }));

      return this.toResponse(state);
    }

    state = this.runNode(state, 'extract_ingredients', (currentState) =>
      this.runTool(
        currentState,
        'extract_ingredients',
        '초안에서 재료와 조건 추출',
        (toolState) => {
          const result = this.extractIngredientsTool.run(toolState.input);

          return {
            ...toolState,
            ingredients: result.ingredients,
            signals: result.signals,
            missingInfoQuestions: result.missingInfoQuestions,
          };
        },
      ),
    );

    if (state.missingInfoQuestions.length > 0) {
      state.status = 'needs_input';
      return this.toResponse(state);
    }

    state = await this.runAsyncNode(state, 'analyze_food_metadata', (currentState) =>
      this.runAsyncTool(
        currentState,
        'analyze_food_metadata',
        `${currentState.ingredients.join(', ')} MCP 영양성분 조회`,
        async (toolState) => {
          const result = await this.analyzeFoodMetadataTool.run(
            toolState.ingredients,
          );

          return {
            ...toolState,
            nutritionAnalysis: result.analysis,
            nutritionSummary: result.summary,
          };
        },
      ),
    );

    state = this.runNode(state, 'evaluate_post_success', (currentState) =>
      this.runTool(
        currentState,
        'evaluate_post_success',
        '댓글 성공률과 예상 댓글 시뮬레이션',
        (toolState) => ({
          ...toolState,
          successPlan: this.evaluatePostSuccessTool.run({
            draft: toolState.input,
            ingredients: toolState.ingredients,
            signals: toolState.signals,
            nutritionSummary: toolState.nutritionSummary,
          }),
        }),
      ),
    );

    state = await this.runAsyncNode(state, 'rewrite_post_draft', (currentState) =>
      this.runAsyncTool(
        currentState,
        'rewrite_post_draft',
        '게시글 초안 재작성',
        async (toolState) => {
          const result = await this.rewritePostDraftTool.run({
            draft: toolState.input,
            ingredients: toolState.ingredients,
            signals: toolState.signals,
            nutritionAnalysis: toolState.nutritionAnalysis,
            nutritionSummary: toolState.nutritionSummary,
            successPlan: toolState.successPlan,
          });

          return {
            ...toolState,
            status: result.source === 'OPENAI' ? 'completed' : 'fallback',
            suggestedTitle: result.suggestedTitle,
            suggestedBody: result.suggestedBody,
            suggestedTags: result.suggestedTags,
          };
        },
      ),
    );

    return this.toResponse(state);
  }

  private createInitialState(input: PostDraftAgentInput): PostDraftAgentState {
    return {
      input: {
        title: input.title?.trim() ?? '',
        content: input.content?.trim() ?? '',
        additionalRequest: input.additionalRequest?.trim() ?? '',
      },
      status: 'fallback',
      stepCount: 0,
      maxSteps: this.maxSteps,
      toolCallCounts: {},
      steps: [],
      toolCalls: [],
      errors: [],
      ingredients: [],
      signals: {
        timePreference: null,
        mealContext: null,
        tastePreference: null,
      },
      missingInfoQuestions: [],
      nutritionAnalysis: null,
      nutritionSummary: null,
      successPlan: null,
      suggestedTitle: null,
      suggestedBody: null,
      suggestedTags: [],
    };
  }

  private analyzeRequest(state: PostDraftAgentState): PostDraftAgentState {
    const text = `${state.input.title} ${state.input.content} ${state.input.additionalRequest}`;
    const preliminary = this.extractIngredientsTool.run(state.input);

    if (text.replace(/\s/g, '').length < 8) {
      return {
        ...state,
        missingInfoQuestions: [
          '어떤 재료가 있고 어떤 메뉴를 원하는지 한 문장만 더 적어주세요.',
        ],
      };
    }

    return {
      ...state,
      ingredients: preliminary.ingredients,
      signals: preliminary.signals,
      missingInfoQuestions: preliminary.missingInfoQuestions,
    };
  }

  private runNode(
    state: PostDraftAgentState,
    node: string,
    action: (state: PostDraftAgentState) => PostDraftAgentState,
  ) {
    if (state.stepCount >= state.maxSteps) {
      return this.failStep(state, node, '최대 추론 단계를 초과해 중단했습니다.');
    }

    const startedState = this.addStep(state, node, 'started', '노드를 실행합니다.');

    try {
      const nextState = action(startedState);

      return this.addStep(
        {
          ...nextState,
          stepCount: startedState.stepCount + 1,
        },
        node,
        'completed',
        '노드 실행을 완료했습니다.',
      );
    } catch (error) {
      return this.failStep(startedState, node, this.getErrorMessage(error));
    }
  }

  private async runAsyncNode(
    state: PostDraftAgentState,
    node: string,
    action: (state: PostDraftAgentState) => Promise<PostDraftAgentState>,
  ) {
    if (state.stepCount >= state.maxSteps) {
      return this.failStep(state, node, '최대 추론 단계를 초과해 중단했습니다.');
    }

    const startedState = this.addStep(state, node, 'started', '노드를 실행합니다.');

    try {
      const nextState = await action(startedState);

      return this.addStep(
        {
          ...nextState,
          stepCount: startedState.stepCount + 1,
        },
        node,
        'completed',
        '노드 실행을 완료했습니다.',
      );
    } catch (error) {
      return this.failStep(startedState, node, this.getErrorMessage(error));
    }
  }

  private runTool(
    state: PostDraftAgentState,
    toolName: string,
    inputSummary: string,
    action: (state: PostDraftAgentState) => PostDraftAgentState,
  ) {
    if (!this.canCallTool(state, toolName)) {
      return this.skipTool(state, toolName, inputSummary);
    }

    try {
      const nextState = action(state);

      return this.completeTool(nextState, toolName, inputSummary);
    } catch (error) {
      return this.failTool(state, toolName, inputSummary, this.getErrorMessage(error));
    }
  }

  private async runAsyncTool(
    state: PostDraftAgentState,
    toolName: string,
    inputSummary: string,
    action: (state: PostDraftAgentState) => Promise<PostDraftAgentState>,
  ) {
    if (!this.canCallTool(state, toolName)) {
      return this.skipTool(state, toolName, inputSummary);
    }

    try {
      const nextState = await action(state);

      return this.completeTool(nextState, toolName, inputSummary);
    } catch (error) {
      return this.failTool(state, toolName, inputSummary, this.getErrorMessage(error));
    }
  }

  private canCallTool(state: PostDraftAgentState, toolName: string) {
    return (state.toolCallCounts[toolName] ?? 0) < this.maxToolCallsPerTool;
  }

  private completeTool(
    state: PostDraftAgentState,
    toolName: string,
    inputSummary: string,
  ) {
    return {
      ...state,
      toolCallCounts: {
        ...state.toolCallCounts,
        [toolName]: (state.toolCallCounts[toolName] ?? 0) + 1,
      },
      toolCalls: [
        ...state.toolCalls,
        {
          toolName,
          status: 'completed' as const,
          inputSummary,
          outputSummary: '도구 실행을 완료했습니다.',
        },
      ],
      steps: [
        ...state.steps,
        {
          index: state.steps.length + 1,
          node: 'tool_call',
          toolName,
          status: 'completed' as const,
          message: inputSummary,
        },
      ],
    };
  }

  private failTool(
    state: PostDraftAgentState,
    toolName: string,
    inputSummary: string,
    message: string,
  ) {
    return {
      ...state,
      status: 'fallback' as const,
      errors: [...state.errors, message],
      toolCallCounts: {
        ...state.toolCallCounts,
        [toolName]: (state.toolCallCounts[toolName] ?? 0) + 1,
      },
      toolCalls: [
        ...state.toolCalls,
        {
          toolName,
          status: 'failed' as const,
          inputSummary,
          outputSummary: message,
        },
      ],
      steps: [
        ...state.steps,
        {
          index: state.steps.length + 1,
          node: 'tool_call',
          toolName,
          status: 'failed' as const,
          message,
        },
      ],
    };
  }

  private skipTool(
    state: PostDraftAgentState,
    toolName: string,
    inputSummary: string,
  ) {
    return {
      ...state,
      errors: [...state.errors, `${toolName} 반복 호출 한도를 초과했습니다.`],
      toolCalls: [
        ...state.toolCalls,
        {
          toolName,
          status: 'skipped' as const,
          inputSummary,
          outputSummary: '반복 호출 방지를 위해 실행하지 않았습니다.',
        },
      ],
    };
  }

  private addStep(
    state: PostDraftAgentState,
    node: string,
    status: PostDraftAgentState['steps'][number]['status'],
    message: string,
  ) {
    return {
      ...state,
      steps: [
        ...state.steps,
        {
          index: state.steps.length + 1,
          node,
          status,
          message,
        },
      ],
    };
  }

  private failStep(state: PostDraftAgentState, node: string, message: string) {
    return this.addStep(
      {
        ...state,
        status: 'fallback',
        errors: [...state.errors, message],
      },
      node,
      'failed',
      message,
    );
  }

  private toResponse(state: PostDraftAgentState): PostDraftAgentResponse {
    return {
      status: state.status,
      message:
        state.status === 'needs_input'
          ? '게시글 초안을 만들기 전에 정보가 조금 더 필요합니다.'
          : state.status === 'completed'
            ? 'AI 에이전트가 MCP 근거를 참고해 게시글 초안을 만들었습니다.'
            : 'AI 호출 없이도 안전한 기본 초안을 만들었습니다.',
      questions: state.missingInfoQuestions,
      suggestedTitle: state.suggestedTitle,
      suggestedBody: state.suggestedBody,
      suggestedTags: state.suggestedTags,
      ingredients: state.ingredients,
      nutritionSummary: state.nutritionSummary,
      nutritionAnalysis: state.nutritionAnalysis,
      successPlan: state.successPlan,
      steps: state.steps,
      toolCalls: state.toolCalls,
      errors: state.errors,
    };
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
  }
}
