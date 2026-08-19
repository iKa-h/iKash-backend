import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AuthChallengeCron {
  private readonly logger = new Logger(AuthChallengeCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredChallenges() {
    try {
      const { count } = await this.prisma.authChallenge.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) {
        this.logger.log(`auth_challenge.purge removed=${count}`);
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error('auth_challenge.purge.failed', {
        error: err.message,
        stack: err.stack,
      });
    }
  }
}
