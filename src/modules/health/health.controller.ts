import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../../prisma/prisma.service';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  uptime: number;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @SkipThrottle()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getHealth(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        db: 'up',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        db: 'down',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    }
  }
}
