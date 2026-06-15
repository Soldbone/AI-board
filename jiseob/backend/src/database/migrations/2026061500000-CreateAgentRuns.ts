import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentRuns2026061500000 implements MigrationInterface {
  name = 'CreateAgentRuns2026061500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "agent_runs" (
        "id" char(26) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "post_id" char(26) NOT NULL,
        "user_id" char(26) NOT NULL,
        "question" text NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "answer" text,
        "evidence_candidates" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "limitations" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "error_code" varchar(80),
        "error_message" text,
        "model" varchar(80),
        "max_steps" integer NOT NULL DEFAULT 4,
        "step_count" integer NOT NULL DEFAULT 0,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        CONSTRAINT "PK_agent_runs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_agent_runs_post_id" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_agent_runs_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_agent_runs_post_id" ON "agent_runs" ("post_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_agent_runs_user_id" ON "agent_runs" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_agent_runs_status" ON "agent_runs" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "agent_steps" (
        "id" char(26) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "run_id" char(26) NOT NULL,
        "step_index" integer NOT NULL,
        "type" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL,
        "tool_name" varchar(120),
        "tool_arguments" jsonb,
        "tool_result" jsonb,
        "model_output" jsonb,
        "error_code" varchar(80),
        "error_message" text,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        CONSTRAINT "PK_agent_steps_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_agent_steps_run_id_step_index" UNIQUE ("run_id", "step_index"),
        CONSTRAINT "FK_agent_steps_run_id" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_agent_steps_run_id" ON "agent_steps" ("run_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_agent_steps_run_id"`);
    await queryRunner.query(`DROP TABLE "agent_steps"`);
    await queryRunner.query(`DROP INDEX "IDX_agent_runs_status"`);
    await queryRunner.query(`DROP INDEX "IDX_agent_runs_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_agent_runs_post_id"`);
    await queryRunner.query(`DROP TABLE "agent_runs"`);
  }
}
