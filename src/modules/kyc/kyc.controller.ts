import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Req,
  Logger,
  Get,
  Query,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { KycService } from './kyc.service';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AppException, ErrorCode } from '../../common/errors';

@Controller('kyc')
export class KycController {
  private readonly webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;
  private readonly logger = new Logger(KycController.name);

  constructor(
    private readonly kycService: KycService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('start')
  async startKyc(@Body('userId') userId: string) {
    if (!userId) {
      throw new AppException(ErrorCode.MISSING_USER_ID, 'User ID is required');
    }
    return this.kycService.initializeSession(userId);
  }

  @Get('status')
  async getKycStatus(@Query('userId') userId: string) {
    if (!userId) {
      throw new AppException(ErrorCode.MISSING_USER_ID, 'User ID is required');
    }
    const user = await this.prisma.appUser.findUnique({
      where: { userId },
      select: { kycStatus: true, kycUpdatedAt: true },
    });
    if (!user) {
      return { kycStatus: 'pending', kycUpdatedAt: null };
    }
    return user;
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-signature-v2') signatureV2: string,
    @Headers('x-signature') signatureV1: string,
    @Headers('x-signature-simple') signatureSimple: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: Record<string, unknown>,
  ) {
    if (!this.webhookSecret) {
      this.logger.error('[WEBHOOK] DIDIT_WEBHOOK_SECRET is not configured');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    const rawBodyBuffer = req.rawBody;
    if (!rawBodyBuffer) {
      this.logger.warn('[WEBHOOK] Missing raw body - verification failed');
      throw new UnauthorizedException('Missing request body');
    }

    const sigToVerify = signatureV2 || signatureV1;

    if (sigToVerify) {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBodyBuffer)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(sigToVerify), Buffer.from(expectedSignature))) {
        this.logger.warn('[WEBHOOK] Signature verification failed');
        throw new UnauthorizedException('Invalid webhook signature');
      }
    } else if (signatureSimple) {
      const sessionId = (payload?.session_id as string) || '';
      const status = (payload?.status as string) || '';
      const webhookType = (payload?.webhook_type as string) || '';
      const simplePayload = ':' + sessionId + ':' + status + ':' + webhookType;
      const expectedSimple = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(simplePayload)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(signatureSimple), Buffer.from(expectedSimple))) {
        this.logger.warn('[WEBHOOK] Simple signature verification failed');
        throw new UnauthorizedException('Invalid webhook signature');
      }
    } else {
      this.logger.warn('[WEBHOOK] No signature header present');
      throw new UnauthorizedException('Missing signature header');
    }

    this.logger.log('[WEBHOOK] Signature verified successfully');
    await this.kycService.processWebhookEvent(payload);
    return { received: true };
  }
}
