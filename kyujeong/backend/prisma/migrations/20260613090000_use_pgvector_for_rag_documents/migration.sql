CREATE EXTENSION IF NOT EXISTS vector;

DROP INDEX IF EXISTS "PostRagDocument_embedding_idx";

ALTER TABLE "PostRagDocument" DROP COLUMN "embedding";
ALTER TABLE "PostRagDocument"
  ADD COLUMN "embedding" vector(1536) NOT NULL
  DEFAULT array_fill(0::double precision, ARRAY[1536])::vector;
ALTER TABLE "PostRagDocument" ALTER COLUMN "embedding" DROP DEFAULT;

CREATE INDEX "PostRagDocument_embedding_idx"
  ON "PostRagDocument"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
