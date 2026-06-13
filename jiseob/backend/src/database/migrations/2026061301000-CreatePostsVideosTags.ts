import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePostsVideosTags2026061301000 implements MigrationInterface {
  name = 'CreatePostsVideosTags2026061301000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "videos" (
        "id" char(26) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "youtube_video_id" varchar(32) NOT NULL,
        "youtube_url" text NOT NULL,
        "title" text,
        "channel_name" varchar(255),
        "thumbnail_url" text,
        "published_at" timestamptz,
        "description" text,
        "youtube_view_count" int,
        "youtube_like_count" int,
        "youtube_comment_count" int,
        "metadata_status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "transcript_status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "embedding_status" varchar(20) NOT NULL DEFAULT 'PENDING',
        CONSTRAINT "PK_videos_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_videos_youtube_video_id" UNIQUE ("youtube_video_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "posts" (
        "id" char(26) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "author_id" char(26) NOT NULL,
        "video_id" char(26) NOT NULL,
        "title" varchar(200) NOT NULL,
        "content" text NOT NULL,
        "youtube_url" text NOT NULL,
        "comment_count" int NOT NULL DEFAULT 0,
        "view_count" int NOT NULL DEFAULT 0,
        "like_count" int NOT NULL DEFAULT 0,
        CONSTRAINT "PK_posts_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_posts_comment_count_non_negative" CHECK ("comment_count" >= 0),
        CONSTRAINT "CHK_posts_view_count_non_negative" CHECK ("view_count" >= 0),
        CONSTRAINT "CHK_posts_like_count_non_negative" CHECK ("like_count" >= 0),
        CONSTRAINT "FK_posts_author_id" FOREIGN KEY ("author_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_posts_video_id" FOREIGN KEY ("video_id") REFERENCES "videos"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tags" (
        "id" char(26) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "name" varchar(50) NOT NULL,
        CONSTRAINT "PK_tags_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tags_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "post_tags" (
        "post_id" char(26) NOT NULL,
        "tag_id" char(26) NOT NULL,
        CONSTRAINT "PK_post_tags_post_id_tag_id" PRIMARY KEY ("post_id", "tag_id"),
        CONSTRAINT "FK_post_tags_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_post_tags_tag_id" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "post_likes" (
        "post_id" char(26) NOT NULL,
        "user_id" char(26) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_post_likes_post_id_user_id" PRIMARY KEY ("post_id", "user_id"),
        CONSTRAINT "FK_post_likes_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_post_likes_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_posts_created_at" ON "posts" ("created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_posts_author_id" ON "posts" ("author_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_posts_video_id" ON "posts" ("video_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_posts_comment_count" ON "posts" ("comment_count")`);
    await queryRunner.query(`CREATE INDEX "IDX_posts_view_count" ON "posts" ("view_count")`);
    await queryRunner.query(`CREATE INDEX "IDX_posts_like_count" ON "posts" ("like_count")`);
    await queryRunner.query(`CREATE INDEX "IDX_post_tags_tag_id" ON "post_tags" ("tag_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_post_likes_user_id" ON "post_likes" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_post_likes_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_post_tags_tag_id"`);
    await queryRunner.query(`DROP INDEX "IDX_posts_like_count"`);
    await queryRunner.query(`DROP INDEX "IDX_posts_view_count"`);
    await queryRunner.query(`DROP INDEX "IDX_posts_comment_count"`);
    await queryRunner.query(`DROP INDEX "IDX_posts_video_id"`);
    await queryRunner.query(`DROP INDEX "IDX_posts_author_id"`);
    await queryRunner.query(`DROP INDEX "IDX_posts_created_at"`);
    await queryRunner.query(`DROP TABLE "post_likes"`);
    await queryRunner.query(`DROP TABLE "post_tags"`);
    await queryRunner.query(`DROP TABLE "tags"`);
    await queryRunner.query(`DROP TABLE "posts"`);
    await queryRunner.query(`DROP TABLE "videos"`);
  }
}
