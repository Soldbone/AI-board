declare module 'pg' {
  export class Client {
    constructor(config: unknown);
    connect(): Promise<void>;
    end(): Promise<void>;
    query(
      sql: string,
      params?: unknown[],
    ): Promise<{
      rowCount: number | null;
      rows: unknown[];
    }>;
  }
}
