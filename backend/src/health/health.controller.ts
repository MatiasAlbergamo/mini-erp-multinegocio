import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // TODO al sumar auth: este endpoint necesita @Public(), o el
  // JwtAuthGuard global lo va a empezar a responder con 401.
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'error', database: 'down' };
    }
  }
}
