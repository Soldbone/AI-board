import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRagEvidences2026061402000 implements MigrationInterface {
  name = 'CreateRagEvidences2026061402000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "comment_analyses"
        ADD "rag_error_code" varchar(80),
        ADD "rag_error_message" text
    `);

    await queryRunner.query(`
      CREATE TABLE "rag_evidences" (
        "id" char(26) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "comment_id" char(26) NOT NULL,
        "transcript_chunk_id" char(26) NOT NULL,
        "evidence_text" text NOT NULL,
        "similarity_score" float NOT NULL,
        CONSTRAINT "PK_rag_evidences_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rag_evidences_comment_id" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rag_evidences_transcript_chunk_id" FOREIGN KEY ("transcript_chunk_id") REFERENCES "transcript_chunks"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_rag_evidences_comment_id" ON "rag_evidences" ("comment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rag_evidences_transcript_chunk_id" ON "rag_evidences" ("transcript_chunk_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rag_evidences_comment_id_similarity_score" ON "rag_evidences" ("comment_id", "similarity_score")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_rag_evidences_comment_id_similarity_score"`);
    await queryRunner.query(`DROP INDEX "IDX_rag_evidences_transcript_chunk_id"`);
    await queryRunner.query(`DROP INDEX "IDX_rag_evidences_comment_id"`);
    await queryRunner.query(`DROP TABLE "rag_evidences"`);

    await queryRunner.query(`
      ALTER TABLE "comment_analyses"
        DROP COLUMN "rag_error_message",
        DROP COLUMN "rag_error_code"
    `);
  }
}
