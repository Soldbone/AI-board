import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateComments2026061302000 implements MigrationInterface {
  name = 'CreateComments2026061302000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" char(26) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "post_id" char(26) NOT NULL,
        "author_id" char(26) NOT NULL,
        "parent_comment_id" char(26),
        "content" text NOT NULL,
        "moderation_status" varchar(30) NOT NULL DEFAULT 'NORMAL',
        CONSTRAINT "PK_comments_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_comments_not_self_parent" CHECK ("id" <> "parent_comment_id"),
        CONSTRAINT "FK_comments_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id"),
        CONSTRAINT "FK_comments_author_id" FOREIGN KEY ("author_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_comments_parent_comment_id" FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_comments_post_id" ON "comments" ("post_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_comments_author_id" ON "comments" ("author_id")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_comments_parent_comment_id" ON "comments" ("parent_comment_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_comments_created_at" ON "comments" ("created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_comments_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_comments_parent_comment_id"`);
    await queryRunner.query(`DROP INDEX "IDX_comments_author_id"`);
    await queryRunner.query(`DROP INDEX "IDX_comments_post_id"`);
    await queryRunner.query(`DROP TABLE "comments"`);
  }
}
