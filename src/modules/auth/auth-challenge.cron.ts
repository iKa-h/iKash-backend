import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from './auth.service';

@Injectable()
export class AuthChallengeCron {
  private readonly logger = new Logger(AuthChallengeCron.name);

  constructor(private readonly authService: AuthService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredChallenges() {
    try {
      const result = await this.authService.purgeExpiredChallenges();
      this.logger.log(
        `auth-challenge.cron.cleanup.success: deleted ${result.count} expired/stale challenge records`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error('auth-challenge.cron.cleanup.failed', {
        error: err.message,
        stack: err.stack,
      });
    }
  }
}
