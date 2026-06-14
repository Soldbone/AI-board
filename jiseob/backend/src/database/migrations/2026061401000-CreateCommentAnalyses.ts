import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommentAnalyses2026061401000 implements MigrationInterface {
  name = 'CreateCommentAnalyses2026061401000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "comment_analyses" (
        "id" char(26) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "comment_id" char(26) NOT NULL,
        "comment_type" varchar(30),
        "ai_analysis_status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "rag_status" varchar(20) NOT NULL DEFAULT 'NOT_REQUIRED',
        "evidence_count" int NOT NULL DEFAULT 0,
        "analyzed_at" timestamptz,
        "error_code" varchar(80),
        "error_message" text,
        CONSTRAINT "PK_comment_analyses_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_comment_analyses_comment_id" UNIQUE ("comment_id"),
        CONSTRAINT "FK_comment_analyses_comment_id" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_comment_analyses_comment_id" ON "comment_analyses" ("comment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comment_analyses_ai_analysis_status" ON "comment_analyses" ("ai_analysis_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comment_analyses_rag_status" ON "comment_analyses" ("rag_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_comment_analyses_rag_status"`);
    await queryRunner.query(`DROP INDEX "IDX_comment_analyses_ai_analysis_status"`);
    await queryRunner.query(`DROP INDEX "IDX_comment_analyses_comment_id"`);
    await queryRunner.query(`DROP TABLE "comment_analyses"`);
  }
}
