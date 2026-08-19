import { Test, TestingModule } from '@nestjs/testing';
import { AuthChallengeCron } from './auth-challenge.cron';
import { AuthService } from './auth.service';

describe('AuthChallengeCron', () => {
  let cron: AuthChallengeCron;

  const authServiceMock = {
    purgeExpiredChallenges: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthChallengeCron,
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
      ],
    }).compile();

    cron = module.get<AuthChallengeCron>(AuthChallengeCron);
    jest.clearAllMocks();
  });

  it('should call purgeExpiredChallenges successfully on cron trigger', async () => {
    authServiceMock.purgeExpiredChallenges.mockResolvedValueOnce({ count: 5 });

    await cron.cleanupExpiredChallenges();

    expect(authServiceMock.purgeExpiredChallenges).toHaveBeenCalledTimes(1);
  });

  it('should catch and log error without throwing when purge fails', async () => {
    authServiceMock.purgeExpiredChallenges.mockRejectedValueOnce(
      new Error('DB error'),
    );

    await expect(cron.cleanupExpiredChallenges()).resolves.not.toThrow();
    expect(authServiceMock.purgeExpiredChallenges).toHaveBeenCalledTimes(1);
  });
});
