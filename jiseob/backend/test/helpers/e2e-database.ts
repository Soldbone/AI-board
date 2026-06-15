import { Client } from 'pg';
import { DataSource } from 'typeorm';

type PgClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<unknown>;
};

const getDatabaseName = (): string => process.env.DATABASE_NAME ?? 'arena_e2e';

const parsePort = (): number => Number(process.env.DATABASE_PORT ?? '5432');

const getSsl = (): false | { rejectUnauthorized: false } =>
  process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;

const assertSafeE2eDatabaseName = (databaseName: string): void => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('E2E database operations are allowed only when NODE_ENV=test.');
  }

  if (!/^arena_e2e(_[a-zA-Z0-9]+)?$/.test(databaseName)) {
    throw new Error(`Refusing to operate on non-E2E database: ${databaseName}`);
  }
};

const quoteIdentifier = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

const createPgClient = (database: string): PgClient => {
  return new Client({
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parsePort(),
    user: process.env.DATABASE_USERNAME ?? 'arena',
    password: process.env.DATABASE_PASSWORD ?? 'arena_dev_password',
    database,
    ssl: getSsl(),
  }) as PgClient;
};

export const ensureE2eDatabase = async (): Promise<void> => {
  const databaseName = getDatabaseName();

  assertSafeE2eDatabaseName(databaseName);

  const client = createPgClient('postgres');

  await client.connect();

  try {
    const result = (await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ])) as { rowCount?: number };

    if (!result.rowCount) {
      await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    }
  } finally {
    await client.end();
  }
};

export const runE2eMigrations = async (dataSource: DataSource): Promise<void> => {
  assertSafeE2eDatabaseName(getDatabaseName());
  await dataSource.runMigrations();
};

export const truncateE2eDatabase = async (dataSource: DataSource): Promise<void> => {
  const databaseName = getDatabaseName();

  assertSafeE2eDatabaseName(databaseName);

  const rows = (await dataSource.query(
    `
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> 'migrations'
      ORDER BY table_name ASC
    `,
  )) as Array<{ tableName: string }>;

  if (rows.length === 0) {
    return;
  }

  const tableNames = rows.map((row) => `"public".${quoteIdentifier(row.tableName)}`).join(', ');

  await dataSource.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`);
};

export const vectorLiteral = (dimension = 1536): string =>
  `[${Array.from({ length: dimension }, (_, index) => (index === 0 ? 1 : 0)).join(',')}]`;
