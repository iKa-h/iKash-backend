jest.mock('@stellar/stellar-sdk', () => {
  const Horizon = {
    Server: jest.fn().mockImplementation(() => ({
      loadAccount: jest.fn(),
    })),
  };
  return {
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      PUBLIC: 'Public Global Stellar Network ; September 2015',
    },
    Horizon,
    Asset: {
      native: jest.fn(),
    },
    StrKey: {
      isValidEd25519PublicKey: jest.fn().mockReturnValue(true),
    },
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: jest.fn().mockReturnValue('dummy-key'),
      }),
      fromPublicKey: jest.fn(),
    },
    BASE_FEE: '100',
    FeeBumpTransaction: jest.fn(),
    Memo: {
      text: jest.fn(),
    },
    Operation: {
      payment: jest.fn(),
    },
    Transaction: jest.fn(),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      addMemo: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({
        sign: jest.fn(),
        toXDR: jest.fn().mockReturnValue('dummy-xdr'),
      }),
    })),
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/errors';

describe('Users GDPR export & deletion (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let ownerId: string;
  let strangerId: string;
  let offerId: string;
  let orderId: string;
  let providerId: string;
  const ownerEmail = 'gdpr-e2e-owner@example.com';

  const tokenFor = (userId: string, publicKey: string) =>
    jwtService.sign({ sub: userId, publicKey });

  beforeAll(async () => {
    process.env.MOCK_PROFILE_UPLOAD = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    const owner = await prisma.appUser.create({
      data: {
        publicKey: 'GOWNERGDPRE2ETESTINGPUBLICKEYFORDATAEXPORT1234501',
        alias: 'gdprE2eOwner',
        email: ownerEmail,
      },
    });
    ownerId = owner.userId;

    const stranger = await prisma.appUser.create({
      data: {
        publicKey: 'GSTRANGERGDPRE2ETESTINGPUBLICKEYFORDATAEXPORT56789',
        alias: 'gdprE2eStranger',
      },
    });
    strangerId = stranger.userId;

    await prisma.waitlist.create({ data: { email: ownerEmail } });

    const provider = await prisma.payment_provider.create({
      data: {
        name: 'GDPR E2E Test Provider',
        type: 'BANK',
        country_code: 'NG',
      },
    });
    providerId = provider.provider_id;

    await prisma.paymentMethod.create({
      data: {
        userId: ownerId,
        providerId,
        type: 'BANK',
        accountIdentifier: '0123456789',
        beneficiaryName: 'GDPR E2E Owner',
      },
    });

    const offer = await prisma.offer.create({
      data: {
        creatorId: ownerId,
        type: 'sell',
        assetCode: 'USDC',
        price: 1.0,
        minAmount: 1.0,
        maxAmount: 100.0,
        status: 'active',
      },
    });
    offerId = offer.offerId;

    const order = await prisma.order.create({
      data: {
        offerId,
        buyerId: strangerId,
        sellerId: ownerId,
        assetAmount: 10,
        fiatAmount: 10,
        orderStatus: 'created',
      },
    });
    orderId = order.orderId;

    await prisma.chatMessage.create({
      data: {
        orderId,
        senderId: ownerId,
        content: 'this is a personal message from the owner',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: ownerId,
        action: 'GDPR_E2E_TEST_ACTION',
        resourceType: 'Test',
        result: 'SUCCESS',
        ipAddress: '203.0.113.42',
        userAgent: 'jest-e2e-agent',
      },
    });
  });

  afterAll(async () => {
    if (orderId) {
      await prisma.chatMessage.deleteMany({ where: { orderId } });
      await prisma.order.deleteMany({ where: { orderId } });
    }
    if (offerId) {
      await prisma.offer.deleteMany({ where: { offerId } });
    }
    if (ownerId) {
      await prisma.paymentMethod.deleteMany({ where: { userId: ownerId } });
      await prisma.auditLog.deleteMany({ where: { userId: ownerId } });
    }
    if (providerId) {
      await prisma.payment_provider.deleteMany({
        where: { provider_id: providerId },
      });
    }
    await prisma.waitlist.deleteMany({ where: { email: ownerEmail } });
    if (ownerId && strangerId) {
      await prisma.appUser.deleteMany({
        where: { userId: { in: [ownerId, strangerId] } },
      });
    }

    if (app) {
      await app.close();
    }
  });

  describe('GET /users/:id/data', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get(`/users/${ownerId}/data`)
        .expect(401);
    });

    it("rejects a caller requesting another user's data", async () => {
      const token = tokenFor(
        strangerId,
        'GSTRANGERGDPRE2ETESTINGPUBLICKEYFORDATAEXPORT56789',
      );

      const response = await request(app.getHttpServer())
        .get(`/users/${ownerId}/data`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body).toMatchObject({ error: 'UNAUTHORIZED_ACTION' });
    });

    it('returns the full personal data footprint for the owning user', async () => {
      const token = tokenFor(
        ownerId,
        'GOWNERGDPRE2ETESTINGPUBLICKEYFORDATAEXPORT1234501',
      );

      const response = await request(app.getHttpServer())
        .get(`/users/${ownerId}/data`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as {
        userId: string;
        email: string;
        paymentMethods: unknown[];
        auditLogs: unknown[];
        offers: unknown[];
        sellOrders: unknown[];
        chatMessages: unknown[];
        waitlist: { email: string } | null;
      };

      expect(body.userId).toBe(ownerId);
      expect(body.email).toBe(ownerEmail);
      expect(body.paymentMethods).toHaveLength(1);
      expect(body.auditLogs.length).toBeGreaterThanOrEqual(1);
      expect(body.offers).toHaveLength(1);
      expect(body.sellOrders).toHaveLength(1);
      expect(body.chatMessages).toHaveLength(1);
      expect(body.waitlist).toMatchObject({ email: ownerEmail });
    });
  });

  describe('DELETE /users/:id', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${ownerId}`)
        .expect(401);
    });

    it("rejects a caller deleting another user's account", async () => {
      const token = tokenFor(
        strangerId,
        'GSTRANGERGDPRE2ETESTINGPUBLICKEYFORDATAEXPORT56789',
      );

      const response = await request(app.getHttpServer())
        .delete(`/users/${ownerId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body).toMatchObject({ error: 'UNAUTHORIZED_ACTION' });
    });

    it('anonymizes the account and its linked PII without breaking FK constraints', async () => {
      const token = tokenFor(
        ownerId,
        'GOWNERGDPRE2ETESTINGPUBLICKEYFORDATAEXPORT1234501',
      );

      await request(app.getHttpServer())
        .delete(`/users/${ownerId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const user = await prisma.appUser.findUnique({
        where: { userId: ownerId },
      });
      expect(user?.deletedAt).not.toBeNull();
      expect(user?.email).toBeNull();
      expect(user?.alias).toBeNull();

      const remainingPaymentMethods = await prisma.paymentMethod.findMany({
        where: { userId: ownerId },
      });
      expect(remainingPaymentMethods).toHaveLength(0);

      const remainingWaitlistEntry = await prisma.waitlist.findUnique({
        where: { email: ownerEmail },
      });
      expect(remainingWaitlistEntry).toBeNull();

      const message = await prisma.chatMessage.findFirst({
        where: { orderId, senderId: ownerId },
      });
      expect(message?.content).toBe('[deleted]');

      const auditLogs = await prisma.auditLog.findMany({
        where: { userId: ownerId, action: 'GDPR_E2E_TEST_ACTION' },
      });
      expect(auditLogs[0]?.ipAddress).toBeNull();
      expect(auditLogs[0]?.userAgent).toBeNull();

      // The order/offer this account was party to must survive untouched.
      const order = await prisma.order.findUnique({ where: { orderId } });
      expect(order?.sellerId).toBe(ownerId);
      const offer = await prisma.offer.findUnique({ where: { offerId } });
      expect(offer?.creatorId).toBe(ownerId);
    });
  });
});
