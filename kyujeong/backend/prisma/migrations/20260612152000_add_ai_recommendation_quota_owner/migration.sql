-- AlterTable
ALTER TABLE "AiRecipeRecommendation" ADD COLUMN "requestedById" INTEGER;

-- CreateIndex
CREATE INDEX "AiRecipeRecommendation_requestedById_createdAt_idx" ON "AiRecipeRecommendation"("requestedById", "createdAt");

-- AddForeignKey
ALTER TABLE "AiRecipeRecommendation" ADD CONSTRAINT "AiRecipeRecommendation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
