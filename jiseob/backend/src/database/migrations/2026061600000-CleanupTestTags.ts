import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupTestTags2026061600000 implements MigrationInterface {
  name = 'CleanupTestTags2026061600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "post_tags"
      WHERE "tag_id" IN (
        SELECT "id"
        FROM "tags"
        WHERE "name" ~* '^(phase|harness)[0-9]+$'
      )
    `);

    await queryRunner.query(`
      DELETE FROM "tags"
      WHERE "name" ~* '^(phase|harness)[0-9]+$'
        AND NOT EXISTS (
          SELECT 1
          FROM "post_tags"
          WHERE "post_tags"."tag_id" = "tags"."id"
        )
    `);
  }

  async down(): Promise<void> {
    return undefined;
  }
}
