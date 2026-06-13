-- DropForeignKey
ALTER TABLE "AiRecipeRecommendation" DROP CONSTRAINT "AiRecipeRecommendation_postId_fkey";

-- AlterTable
ALTER TABLE "AiRecipeRecommendation" ALTER COLUMN "postId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "AiRecipeRecommendation" ADD CONSTRAINT "AiRecipeRecommendation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
