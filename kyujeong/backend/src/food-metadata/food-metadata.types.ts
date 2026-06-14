export type MatchStatus =
  | 'matched'
  | 'candidate'
  | 'not_found'
  | 'configuration_missing'
  | 'rate_limited'
  | 'api_error';

export type NutritionFacts = {
  energyKcal: number | null;
  carbohydrateG: number | null;
  proteinG: number | null;
  fatG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
};

export type FoodCandidate = {
  id: string | null;
  originalName: string;
  matchedName: string;
  normalizedName: string;
  servingSize: string | null;
  nutrition: NutritionFacts;
  source: string;
  matchStatus: MatchStatus;
  raw?: Record<string, unknown>;
};

export type FoodSearchResult = {
  originalInput: string;
  normalizedInput: string;
  candidates: FoodCandidate[];
  totalCount: number;
  source: string;
  matchStatus: MatchStatus;
  message: string | null;
};

export type FoodNutritionResult = {
  originalInput: string;
  normalizedInput: string;
  item: FoodCandidate | null;
  source: string;
  matchStatus: MatchStatus;
  message: string | null;
};

export type IngredientNutritionSummary = {
  originalInput: string;
  normalizedInput: string;
  matchedName: string | null;
  servingSize: string | null;
  nutrition: NutritionFacts;
  matchStatus: MatchStatus;
  message: string | null;
};

export type IngredientSetAnalysis = {
  originalInputs: string[];
  normalizedInputs: string[];
  ingredients: IngredientNutritionSummary[];
  totals: NutritionFacts;
  perIngredientAverage: NutritionFacts;
  dataSource: string;
  matchStatus: MatchStatus;
  notes: string[];
};

export type FoodDataClientSearchOptions = {
  query: string;
  page?: number;
  limit?: number;
};

export type FoodDataClient = {
  search(options: FoodDataClientSearchOptions): Promise<FoodSearchResult>;
};
