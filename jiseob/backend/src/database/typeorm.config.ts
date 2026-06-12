import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';

const parseBoolean = (value: string | undefined): boolean => value === 'true';

const parsePort = (value: string | undefined): number => (value ? Number(value) : 5432);

const isTsNodeRuntime = (): boolean => process.argv.some((arg) => arg.includes('ts-node'));

const getEntityGlobs = (): string[] => {
  const sourceRoot = isTsNodeRuntime() ? 'src' : 'dist';

  return [join(process.cwd(), `${sourceRoot}/**/*.entity.${sourceRoot === 'src' ? 'ts' : 'js'}`)];
};

const getMigrationGlobs = (): string[] => {
  const sourceRoot = isTsNodeRuntime() ? 'src' : 'dist';

  return [
    join(
      process.cwd(),
      `${sourceRoot}/database/migrations/*.${sourceRoot === 'src' ? 'ts' : 'js'}`,
    ),
  ];
};

const buildDataSourceOptions = (env: NodeJS.ProcessEnv): DataSourceOptions => ({
  type: 'postgres',
  host: env.DATABASE_HOST ?? 'localhost',
  port: parsePort(env.DATABASE_PORT),
  username: env.DATABASE_USERNAME ?? 'arena',
  password: env.DATABASE_PASSWORD ?? 'arena_dev_password',
  database: env.DATABASE_NAME ?? 'arena',
  ssl: parseBoolean(env.DATABASE_SSL) ? { rejectUnauthorized: false } : false,
  synchronize: false,
  migrationsRun: false,
  entities: getEntityGlobs(),
  migrations: getMigrationGlobs(),
});

export const getTypeOrmModuleOptions = (configService: ConfigService): TypeOrmModuleOptions => ({
  ...buildDataSourceOptions({
    DATABASE_HOST: configService.get<string>('DATABASE_HOST'),
    DATABASE_PORT: configService.get<string>('DATABASE_PORT'),
    DATABASE_USERNAME: configService.get<string>('DATABASE_USERNAME'),
    DATABASE_PASSWORD: configService.get<string>('DATABASE_PASSWORD'),
    DATABASE_NAME: configService.get<string>('DATABASE_NAME'),
    DATABASE_SSL: configService.get<string>('DATABASE_SSL'),
  }),
  autoLoadEntities: true,
});

export const dataSourceOptions = buildDataSourceOptions(process.env);

export default new DataSource(dataSourceOptions);
