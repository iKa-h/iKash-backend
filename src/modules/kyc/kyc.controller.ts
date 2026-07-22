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
      this.logger.error({ event: 'webhook.secret.missing' });
      throw new AppException(ErrorCode.KYC_WEBHOOK_SECRET_MISSING, 'DIDIT_WEBHOOK_SECRET is not configured');
    }

    const rawBodyBuffer = req.rawBody;
    if (!rawBodyBuffer) {
      this.logger.warn({ event: 'webhook.body.missing' });
      throw new AppException(ErrorCode.KYC_WEBHOOK_SIGNATURE_INVALID, 'Missing request body');
    }

    const sigToVerify = signatureV2 || signatureV1;

    if (sigToVerify) {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBodyBuffer)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(sigToVerify), Buffer.from(expectedSignature))) {
        this.logger.warn({ event: 'webhook.signature.invalid', signaturePrefix: sigToVerify.substring(0, 4) + '***' });
        throw new AppException(ErrorCode.KYC_WEBHOOK_SIGNATURE_INVALID, 'Invalid webhook signature');
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
        this.logger.warn({ event: 'webhook.signature.invalid', type: 'simple' });
        throw new AppException(ErrorCode.KYC_WEBHOOK_SIGNATURE_INVALID, 'Invalid webhook signature');
      }
    } else {
      this.logger.warn({ event: 'webhook.signature.missing' });
      throw new AppException(ErrorCode.KYC_WEBHOOK_SIGNATURE_INVALID, 'Missing signature header');
    }

    this.logger.log({ event: 'webhook.signature.verified' });
    await this.kycService.processWebhookEvent(payload);
    return { received: true };
  }
}

