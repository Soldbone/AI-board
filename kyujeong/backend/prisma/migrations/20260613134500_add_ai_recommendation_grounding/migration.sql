CREATE TYPE "AiRecommendationGrounding" AS ENUM ('COMMUNITY_RAG', 'GENERAL_AI');

ALTER TABLE "AiRecipeRecommendation"
  ADD COLUMN "grounding" "AiRecommendationGrounding" NOT NULL DEFAULT 'COMMUNITY_RAG';
