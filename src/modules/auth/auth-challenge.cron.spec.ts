import { Test, TestingModule } from '@nestjs/testing';
import { AuthChallengeCron } from './auth-challenge.cron';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AuthChallengeCron', () => {
  let cron: AuthChallengeCron;
  let mockPrismaService: {
    authChallenge: { deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrismaService = {
      authChallenge: { deleteMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthChallengeCron,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    cron = module.get(AuthChallengeCron);
  });

  it('purges challenges whose expiresAt is in the past', async () => {
    mockPrismaService.authChallenge.deleteMany.mockResolvedValue({ count: 3 });

    await cron.purgeExpiredChallenges();

    const call = mockPrismaService.authChallenge.deleteMany.mock.calls[0] as [
      { where: { expiresAt: { lt: Date } } },
    ];
    expect(call[0].where.expiresAt.lt).toBeInstanceOf(Date);
  });

  it('swallows errors so a DB failure does not crash the scheduler', async () => {
    mockPrismaService.authChallenge.deleteMany.mockRejectedValue(
      new Error('db down'),
    );

    await expect(cron.purgeExpiredChallenges()).resolves.toBeUndefined();
  });
});
