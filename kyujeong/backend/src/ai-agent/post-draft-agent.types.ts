import type { IngredientSetAnalysis } from '../food-metadata/food-metadata.types';

export type PostDraftAgentStatus = 'needs_input' | 'completed' | 'fallback';

export type PostDraftAgentInput = {
  title?: string;
  content?: string;
  additionalRequest?: string;
};

export type PostDraftAgentStep = {
  index: number;
  node: string;
  toolName?: string;
  status: 'started' | 'completed' | 'skipped' | 'failed';
  message: string;
};

export type PostDraftToolCall = {
  toolName: string;
  status: 'completed' | 'failed' | 'skipped';
  inputSummary: string;
  outputSummary: string;
};

export type DraftSignals = {
  timePreference: string | null;
  mealContext: string | null;
  tastePreference: string | null;
};

export type PostQualityCheck = {
  label: string;
  status: 'good' | 'warning' | 'missing';
  detail: string;
};

export type PostSuccessPlan = {
  score: number;
  level: 'strong' | 'needs_work' | 'weak';
  summary: string;
  checks: PostQualityCheck[];
  expectedComments: string[];
  engagementQuestions: string[];
};

export type PostDraftAgentState = {
  input: PostDraftAgentInput;
  status: PostDraftAgentStatus;
  stepCount: number;
  maxSteps: number;
  toolCallCounts: Record<string, number>;
  steps: PostDraftAgentStep[];
  toolCalls: PostDraftToolCall[];
  errors: string[];
  ingredients: string[];
  signals: DraftSignals;
  missingInfoQuestions: string[];
  nutritionAnalysis: IngredientSetAnalysis | null;
  nutritionSummary: string | null;
  successPlan: PostSuccessPlan | null;
  suggestedTitle: string | null;
  suggestedBody: string | null;
  suggestedTags: string[];
};

export type PostDraftAgentResponse = {
  status: PostDraftAgentStatus;
  message: string;
  questions: string[];
  suggestedTitle: string | null;
  suggestedBody: string | null;
  suggestedTags: string[];
  ingredients: string[];
  nutritionSummary: string | null;
  nutritionAnalysis: IngredientSetAnalysis | null;
  successPlan: PostSuccessPlan | null;
  steps: PostDraftAgentStep[];
  toolCalls: PostDraftToolCall[];
  errors: string[];
};
