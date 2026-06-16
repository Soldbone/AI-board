import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiSummaries2026061501000 implements MigrationInterface {
  name = 'CreateAiSummaries2026061501000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_summaries" (
        "id" char(26) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "target_type" varchar(30) NOT NULL DEFAULT 'COMMENT_THREAD',
        "post_id" char(26) NOT NULL,
        "root_comment_id" char(26) NOT NULL,
        "created_by_id" char(26),
        "summary_text" text,
        "summary_status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "summarized_comment_count" integer NOT NULL DEFAULT 0,
        "last_comment_id" char(26),
        "last_comment_updated_at" timestamptz,
        "error_code" varchar(80),
        "error_message" text,
        "generated_at" timestamptz,
        CONSTRAINT "PK_ai_summaries_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_summaries_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ai_summaries_root_comment_id" FOREIGN KEY ("root_comment_id") REFERENCES "comments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ai_summaries_created_by_id" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_ai_summaries_post_id" ON "ai_summaries" ("post_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_summaries_root_comment_id" ON "ai_summaries" ("root_comment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_summaries_summary_status" ON "ai_summaries" ("summary_status")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ai_summaries_active_root_comment_id"
      ON "ai_summaries" ("root_comment_id")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_ai_summaries_active_root_comment_id"`);
    await queryRunner.query(`DROP INDEX "IDX_ai_summaries_summary_status"`);
    await queryRunner.query(`DROP INDEX "IDX_ai_summaries_root_comment_id"`);
    await queryRunner.query(`DROP INDEX "IDX_ai_summaries_post_id"`);
    await queryRunner.query(`DROP TABLE "ai_summaries"`);
  }
}
