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
import { TrustlessWorkService } from '../src/modules/escrow/trustless-work.service';
import { HttpExceptionFilter } from '../src/common/errors';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from '../src/config/cookie.config';

/**
 * In-memory stand-in for `PrismaService` so this suite runs without a live
 * Postgres instance (same pattern as `test/order-expiration.e2e-spec.ts`
 * and `test/auth.e2e-spec.ts`). Only the operations exercised by the GDPR
 * export/deletion flow are implemented.
 */
type Row = Record<string, unknown>;

class FakePrismaService {
  private seq = 1;
  readonly appUsers: Row[] = [];
  readonly waitlistRows: Row[] = [];
  readonly providers: Row[] = [];
  readonly paymentMethods: Row[] = [];
  readonly offers: Row[] = [];
  readonly orders: Row[] = [];
  readonly chatMessages: Row[] = [];
  readonly auditLogs: Row[] = [];

  private id(prefix: string): string {
    return `${prefix}-${this.seq++}`;
  }

  private matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (cond !== null && typeof cond === 'object' && 'in' in (cond as Row)) {
        return ((cond as { in: unknown[] }).in ?? []).includes(row[key]);
      }
      return row[key] === cond;
    });
  }

  // --- lifecycle no-ops -----------------------------------------------------
  $connect(): Promise<void> {
    return Promise.resolve();
  }
  $disconnect(): Promise<void> {
    return Promise.resolve();
  }
  onModuleInit(): Promise<void> {
    return Promise.resolve();
  }
  onModuleDestroy(): Promise<void> {
    return Promise.resolve();
  }
  $on(): void {}

  $transaction<T>(arg: ((tx: this) => Promise<T>) | Promise<T>[]): Promise<T> {
    if (typeof arg === 'function') {
      return arg(this);
    }
    return Promise.all(arg) as unknown as Promise<T>;
  }

  appUser = {
    create: ({ data }: { data: Row }): Promise<Row> => {
      const row: Row = {
        userId: this.id('user'),
        publicKey: null,
        alias: null,
        username: null,
        email: null,
        bio: null,
        profileImageUrl: null,
        currentNonce: null,
        preferredCurrency: null,
        kycStatus: 'pending',
        role: 'user',
        deletedAt: null,
        createdAt: new Date(),
        ...data,
      };
      this.appUsers.push(row);
      return Promise.resolve({ ...row });
    },
    findUnique: ({
      where,
      include,
    }: {
      where: Row;
      include?: Record<string, boolean>;
    }): Promise<Row | null> => {
      const row = this.appUsers.find((u) => this.matches(u, where));
      if (!row) return Promise.resolve(null);
      const result: Row = { ...row };
      if (include) {
        const uid = row.userId;
        if (include.paymentMethods)
          result.paymentMethods = this.paymentMethods.filter(
            (p) => p.userId === uid,
          );
        if (include.auditLogs)
          result.auditLogs = this.auditLogs.filter((a) => a.userId === uid);
        if (include.offers)
          result.offers = this.offers.filter((o) => o.creatorId === uid);
        if (include.buyOrders)
          result.buyOrders = this.orders.filter((o) => o.buyerId === uid);
        if (include.sellOrders)
          result.sellOrders = this.orders.filter((o) => o.sellerId === uid);
        if (include.chatMessages)
          result.chatMessages = this.chatMessages.filter(
            (c) => c.senderId === uid,
          );
      }
      return Promise.resolve(result);
    },
    update: ({ where, data }: { where: Row; data: Row }): Promise<Row> => {
      const row = this.appUsers.find((u) => this.matches(u, where));
      if (!row) return Promise.reject(new Error('appUser not found'));
      Object.assign(row, data);
      return Promise.resolve({ ...row });
    },
    deleteMany: ({ where }: { where?: Row }): Promise<{ count: number }> =>
      Promise.resolve(this.deleteFrom(this.appUsers, where)),
  };

  waitlist = {
    create: ({ data }: { data: Row }): Promise<Row> => {
      const row: Row = {
        waitlistId: this.id('waitlist'),
        createdAt: new Date(),
        ...data,
      };
      this.waitlistRows.push(row);
      return Promise.resolve({ ...row });
    },
    findUnique: ({ where }: { where: Row }): Promise<Row | null> =>
      Promise.resolve(
        this.waitlistRows.find((w) => this.matches(w, where)) ?? null,
      ),
    deleteMany: ({ where }: { where?: Row }): Promise<{ count: number }> =>
      Promise.resolve(this.deleteFrom(this.waitlistRows, where)),
  };

  payment_provider = {
    create: ({ data }: { data: Row }): Promise<Row> => {
      const row: Row = {
        provider_id: this.id('provider'),
        metadata: null,
        ...data,
      };
      this.providers.push(row);
      return Promise.resolve({ ...row });
    },
    findUnique: ({ where }: { where: Row }): Promise<Row | null> =>
      Promise.resolve(
        this.providers.find((p) => this.matches(p, where)) ?? null,
      ),
    deleteMany: ({ where }: { where?: Row }): Promise<{ count: number }> =>
      Promise.resolve(this.deleteFrom(this.providers, where)),
  };

  paymentMethod = {
    create: ({ data }: { data: Row }): Promise<Row> => {
      const row: Row = {
        paymentMethodId: this.id('pm'),
        createdAt: new Date(),
        ...data,
      };
      this.paymentMethods.push(row);
      return Promise.resolve({ ...row });
    },
    findMany: ({ where }: { where?: Row }): Promise<Row[]> =>
      Promise.resolve(
        this.paymentMethods.filter((p) => this.matches(p, where)),
      ),
    deleteMany: ({ where }: { where?: Row }): Promise<{ count: number }> =>
      Promise.resolve(this.deleteFrom(this.paymentMethods, where)),
  };

  offer = {
    create: ({ data }: { data: Row }): Promise<Row> => {
      const row: Row = { offerId: this.id('offer'), ...data };
      this.offers.push(row);
      return Promise.resolve({ ...row });
    },
    findUnique: ({ where }: { where: Row }): Promise<Row | null> =>
      Promise.resolve(this.offers.find((o) => this.matches(o, where)) ?? null),
    deleteMany: ({ where }: { where?: Row }): Promise<{ count: number }> =>
      Promise.resolve(this.deleteFrom(this.offers, where)),
  };

  order = {
    create: ({ data }: { data: Row }): Promise<Row> => {
      const row: Row = { orderId: this.id('order'), ...data };
      this.orders.push(row);
      return Promise.resolve({ ...row });
    },
    findUnique: ({ where }: { where: Row }): Promise<Row | null> =>
      Promise.resolve(this.orders.find((o) => this.matches(o, where)) ?? null),
    deleteMany: ({ where }: { where?: Row }): Promise<{ count: number }> =>
      Promise.resolve(this.deleteFrom(this.orders, where)),
  };

  chatMessage = {
    create: ({ data }: { data: Row }): Promise<Row> => {
      const row: Row = {
        chatMessageId: this.id('msg'),
        createdAt: new Date(),
        ...data,
      };
      this.chatMessages.push(row);
      return Promise.resolve({ ...row });
    },
    findFirst: ({ where }: { where?: Row }): Promise<Row | null> =>
      Promise.resolve(
        this.chatMessages.find((c) => this.matches(c, where)) ?? null,
      ),
    updateMany: ({
      where,
      data,
    }: {
      where?: Row;
      data: Row;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of this.chatMessages) {
        if (this.matches(row, where)) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },
    deleteMany: ({ where }: { where?: Row }): Promise<{ count: number }> =>
      Promise.resolve(this.deleteFrom(this.chatMessages, where)),
  };

  auditLog = {
    create: ({ data }: { data: Row }): Promise<Row> => {
      const row: Row = {
        auditLogId: this.id('audit'),
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
        ...data,
      };
      this.auditLogs.push(row);
      return Promise.resolve({ ...row });
    },
    findMany: ({ where }: { where?: Row }): Promise<Row[]> =>
      Promise.resolve(this.auditLogs.filter((a) => this.matches(a, where))),
    updateMany: ({
      where,
      data,
    }: {
      where?: Row;
      data: Row;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of this.auditLogs) {
        if (this.matches(row, where)) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },
    deleteMany: ({ where }: { where?: Row }): Promise<{ count: number }> =>
      Promise.resolve(this.deleteFrom(this.auditLogs, where)),
  };

  private deleteFrom(list: Row[], where: Row = {}): { count: number } {
    let count = 0;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (this.matches(list[i], where)) {
        list.splice(i, 1);
        count += 1;
      }
    }
    return { count };
  }
}

describe('Users GDPR export & deletion (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: FakePrismaService;
  let jwtService: JwtService;

  let ownerId: string;
  let strangerId: string;
  let offerId: string;
  let orderId: string;
  let providerId: string;
  const ownerEmail = 'gdpr-e2e-owner@example.com';
  const ownerKey = 'GOWNERGDPRE2ETESTINGPUBLICKEYFORDATAEXPORT1234501';
  const strangerKey = 'GSTRANGERGDPRE2ETESTINGPUBLICKEYFORDATAEXPORT56789';
  const csrfToken = 'gdpr-e2e-csrf-token-1234567890abcdef';

  const tokenFor = (userId: string, publicKey: string) =>
    jwtService.sign({ sub: userId, publicKey });

  const withCsrf = (req: request.Test) =>
    req
      .set('Cookie', [`${CSRF_COOKIE_NAME}=${csrfToken}`])
      .set(CSRF_HEADER_NAME, csrfToken);

  beforeAll(async () => {
    process.env.MOCK_PROFILE_UPLOAD = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new FakePrismaService())
      .overrideProvider(TrustlessWorkService)
      .useValue({ getEscrowBalance: jest.fn().mockResolvedValue([]) })
      .compile();

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

    prisma = app.get<PrismaService>(
      PrismaService,
    ) as unknown as FakePrismaService;
    jwtService = app.get<JwtService>(JwtService);

    const owner = await prisma.appUser.create({
      data: { publicKey: ownerKey, alias: 'gdprE2eOwner', email: ownerEmail },
    });
    ownerId = owner.userId as string;

    const stranger = await prisma.appUser.create({
      data: { publicKey: strangerKey, alias: 'gdprE2eStranger' },
    });
    strangerId = stranger.userId as string;

    await prisma.waitlist.create({ data: { email: ownerEmail } });

    const provider = await prisma.payment_provider.create({
      data: {
        name: 'GDPR E2E Test Provider',
        type: 'BANK',
        country_code: 'NG',
      },
    });
    providerId = provider.provider_id as string;

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
    offerId = offer.offerId as string;

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
    orderId = order.orderId as string;

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
      const token = tokenFor(strangerId, strangerKey);

      const response = await request(app.getHttpServer())
        .get(`/users/${ownerId}/data`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body).toMatchObject({ error: 'UNAUTHORIZED_ACTION' });
    });

    it('returns the full personal data footprint for the owning user', async () => {
      const token = tokenFor(ownerId, ownerKey);

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
      await withCsrf(
        request(app.getHttpServer()).delete(`/users/${ownerId}`),
      ).expect(401);
    });

    it("rejects a caller deleting another user's account", async () => {
      const token = tokenFor(strangerId, strangerKey);

      const response = await withCsrf(
        request(app.getHttpServer())
          .delete(`/users/${ownerId}`)
          .set('Authorization', `Bearer ${token}`),
      ).expect(403);

      expect(response.body).toMatchObject({ error: 'UNAUTHORIZED_ACTION' });
    });

    it('anonymizes the account and its linked PII without breaking FK constraints', async () => {
      const token = tokenFor(ownerId, ownerKey);

      await withCsrf(
        request(app.getHttpServer())
          .delete(`/users/${ownerId}`)
          .set('Authorization', `Bearer ${token}`),
      ).expect(200);

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
