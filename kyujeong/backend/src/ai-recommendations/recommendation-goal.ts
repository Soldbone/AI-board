export const AI_RECOMMENDATION_GOALS = [
  'BALANCED',
  'HIGH_PROTEIN',
  'LIGHT',
  'LOW_SODIUM',
  'FILLING',
  'POST_WORKOUT',
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
    POST_WORKOUT: '운동 후',
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
  POST_WORKOUT:
    'Prefer a post-workout style meal with practical protein and carbohydrate balance, without making medical claims.',
};

export function normalizeAiRecommendationGoal(
  value?: string | null,
): AiRecommendationGoal {
  return AI_RECOMMENDATION_GOALS.includes(value as AiRecommendationGoal)
    ? (value as AiRecommendationGoal)
    : DEFAULT_AI_RECOMMENDATION_GOAL;
}
