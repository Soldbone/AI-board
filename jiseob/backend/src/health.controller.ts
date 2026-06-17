import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: 'arena-api',
    };
  }

  @Get('db')
  async checkDatabase() {
    try {
      await this.dataSource.query('SELECT 1');

      return {
        status: 'ok',
        service: 'arena-api',
        database: {
          status: 'ok',
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'arena-api',
        database: {
          status: 'error',
        },
      });
    }
  }
}
