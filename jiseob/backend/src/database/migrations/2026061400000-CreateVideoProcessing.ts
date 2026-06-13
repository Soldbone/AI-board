import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideoProcessing2026061400000 implements MigrationInterface {
  name = 'CreateVideoProcessing2026061400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(`
      ALTER TABLE "videos"
        ADD "metadata_error_code" varchar(80),
        ADD "metadata_error_message" text,
        ADD "transcript_error_code" varchar(80),
        ADD "transcript_error_message" text,
        ADD "embedding_error_code" varchar(80),
        ADD "embedding_error_message" text,
        ADD "processed_at" timestamptz,
        ADD "processing_locked_until" timestamptz
    `);

    await queryRunner.query(`
      CREATE TABLE "transcript_chunks" (
        "id" char(26) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "video_id" char(26) NOT NULL,
        "chunk_index" int NOT NULL,
        "content" text NOT NULL,
        "start_time" float,
        "end_time" float,
        "embedding" vector(1536),
        CONSTRAINT "PK_transcript_chunks_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transcript_chunks_video_id_chunk_index" UNIQUE ("video_id", "chunk_index"),
        CONSTRAINT "FK_transcript_chunks_video_id" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_transcript_chunks_video_id" ON "transcript_chunks" ("video_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_videos_processing_locked_until" ON "videos" ("processing_locked_until")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_videos_processing_locked_until"`);
    await queryRunner.query(`DROP INDEX "IDX_transcript_chunks_video_id"`);
    await queryRunner.query(`DROP TABLE "transcript_chunks"`);

    await queryRunner.query(`
      ALTER TABLE "videos"
        DROP COLUMN "processing_locked_until",
        DROP COLUMN "processed_at",
        DROP COLUMN "embedding_error_message",
        DROP COLUMN "embedding_error_code",
        DROP COLUMN "transcript_error_message",
        DROP COLUMN "transcript_error_code",
        DROP COLUMN "metadata_error_message",
        DROP COLUMN "metadata_error_code"
    `);
  }
}
