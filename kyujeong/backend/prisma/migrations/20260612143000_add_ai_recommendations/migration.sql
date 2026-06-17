-- CreateEnum
CREATE TYPE "AiRecommendationStatus" AS ENUM ('ACTIVE', 'STALE');

-- CreateTable
CREATE TABLE "PostRagDocument" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "documentText" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[] NOT NULL,
    "embeddingModel" TEXT NOT NULL DEFAULT 'local-hash-v1',
    "embeddedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostRagDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRecipeRecommendation" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "menuName" VARCHAR(120) NOT NULL,
    "reason" TEXT NOT NULL,
    "availableIngredients" TEXT[] NOT NULL,
    "missingIngredients" TEXT[] NOT NULL,
    "estimatedCookingTime" INTEGER,
    "difficulty" VARCHAR(40) NOT NULL,
    "content" TEXT NOT NULL,
    "status" "AiRecommendationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRecipeRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRecommendationReference" (
    "id" SERIAL NOT NULL,
    "recommendationId" INTEGER NOT NULL,
    "postId" INTEGER NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "AiRecommendationReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostRagDocument_postId_key" ON "PostRagDocument"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRecommendationReference_recommendationId_postId_key" ON "AiRecommendationReference"("recommendationId", "postId");

-- AddForeignKey
ALTER TABLE "PostRagDocument" ADD CONSTRAINT "PostRagDocument_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRecipeRecommendation" ADD CONSTRAINT "AiRecipeRecommendation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRecommendationReference" ADD CONSTRAINT "AiRecommendationReference_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "AiRecipeRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRecommendationReference" ADD CONSTRAINT "AiRecommendationReference_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
