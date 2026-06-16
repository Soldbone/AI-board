CREATE TYPE "PostCategory" AS ENUM (
  'QUESTION',
  'RECIPE_SHARE',
  'COOKING_TIP_REVIEW',
  'TREND'
);

ALTER TABLE "Post"
  ADD COLUMN "category" "PostCategory" NOT NULL DEFAULT 'QUESTION';

UPDATE "Post"
SET "category" = CASE
  WHEN "title" ILIKE '%후기%'
    OR "title" ILIKE '%팁%'
    OR "content" ILIKE '%후기%'
    OR "content" ILIKE '%팁%'
    THEN 'COOKING_TIP_REVIEW'::"PostCategory"
  WHEN "title" ILIKE '%레시피%'
    OR "title" ILIKE '%만들기%'
    OR "title" ILIKE '%조림%'
    OR "content" ILIKE '%만드는 법%'
    THEN 'RECIPE_SHARE'::"PostCategory"
  WHEN "title" ILIKE '%요즘%'
    OR "title" ILIKE '%유행%'
    OR "title" ILIKE '%트렌드%'
    OR "content" ILIKE '%유행%'
    THEN 'TREND'::"PostCategory"
  ELSE 'QUESTION'::"PostCategory"
END;
