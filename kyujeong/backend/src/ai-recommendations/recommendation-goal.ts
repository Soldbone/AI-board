export const AI_RECOMMENDATION_GOALS = [
  'BALANCED',
  'HIGH_PROTEIN',
  'LIGHT',
  'LOW_SODIUM',
  'FILLING',
  'QUICK',
  'BUDGET',
  'LOW_CALORIE',
  'MORE_VEGETABLES',
] as const;

export type AiRecommendationGoal = (typeof AI_RECOMMENDATION_GOALS)[number];

export const DEFAULT_AI_RECOMMENDATION_GOAL: AiRecommendationGoal = 'BALANCED';

export const AI_RECOMMENDATION_GOAL_LABELS: Record<AiRecommendationGoal, string> =
  {
    BALANCED: '기본 추천',
    HIGH_PROTEIN: '고단백',
    LIGHT: '가볍게',
    LOW_SODIUM: '나트륨 낮게',
    FILLING: '든든하게',
    QUICK: '빠르게',
    BUDGET: '저렴하게',
    LOW_CALORIE: '칼로리 낮게',
    MORE_VEGETABLES: '채소 많이',
  };

export const AI_RECOMMENDATION_GOAL_INSTRUCTIONS: Record<
  AiRecommendationGoal,
  string
> = {
  BALANCED:
    'Recommend a practical balanced home meal without over-optimizing a single nutrient.',
  HIGH_PROTEIN:
    'Prefer recipes that make good use of protein-containing ingredients and suggest simple protein add-ons only when needed.',
  LIGHT:
    'Prefer a lighter recipe with less oil and smaller portions of rice or noodles when possible.',
  LOW_SODIUM:
    'Prefer lower-sodium cooking choices and suggest reducing salty seasonings or rinsing salty ingredients when appropriate.',
  FILLING:
    'Prefer a filling meal that combines protein, carbohydrates, and vegetables when possible.',
  QUICK:
    'Prefer a quick recipe with fewer steps, short cooking time, and simple preparation.',
  BUDGET:
    'Prefer a budget-friendly recipe that uses owned ingredients first and avoids unnecessary extra purchases.',
  LOW_CALORIE:
    'Prefer lower-calorie cooking choices with less oil, smaller portions of rice or noodles, and more light ingredients when possible.',
  MORE_VEGETABLES:
    'Prefer recipes that use vegetables generously and keep the dish practical with the owned ingredients.',
};

export function normalizeAiRecommendationGoal(
  value?: string | null,
): AiRecommendationGoal {
  return AI_RECOMMENDATION_GOALS.includes(value as AiRecommendationGoal)
    ? (value as AiRecommendationGoal)
    : DEFAULT_AI_RECOMMENDATION_GOAL;
}

export function normalizeAiRecommendationGoals(
  value?: string | string[] | null,
): AiRecommendationGoal[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const normalizedGoals = values.filter((goal): goal is AiRecommendationGoal =>
    AI_RECOMMENDATION_GOALS.includes(goal as AiRecommendationGoal),
  );
  const uniqueGoals = [...new Set(normalizedGoals)];

  if (uniqueGoals.length === 0) {
    return [DEFAULT_AI_RECOMMENDATION_GOAL];
  }

  if (uniqueGoals.length > 1 && uniqueGoals.includes('BALANCED')) {
    return uniqueGoals.filter((goal) => goal !== 'BALANCED');
  }

  return uniqueGoals;
}
