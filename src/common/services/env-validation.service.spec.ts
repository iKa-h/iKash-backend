import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  EnvValidationService,
  CRITICAL_ENV_VARS,
} from './env-validation.service';

describe('EnvValidationService', () => {
  let service: EnvValidationService;

  const mockConfig: Record<string, string> = {};

  const configMock = {
    get: jest.fn((key: string) => mockConfig[key]),
  };

  beforeEach(async () => {
    // Reset mock config
    for (const key of Object.keys(mockConfig)) {
      delete mockConfig[key];
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnvValidationService,
        {
          provide: ConfigService,
          useValue: configMock,
        },
      ],
    }).compile();

    service = module.get<EnvValidationService>(EnvValidationService);
    jest.clearAllMocks();
  });

  it('should pass validation when all critical environment variables are present', () => {
    for (const key of CRITICAL_ENV_VARS) {
      mockConfig[key] = 'valid_value';
    }

    expect(() => service.validateCriticalEnvs(CRITICAL_ENV_VARS)).not.toThrow();
  });

  it('should throw an error with the missing key name when a critical env var is missing', () => {
    for (const key of CRITICAL_ENV_VARS) {
      mockConfig[key] = 'valid_value';
    }
    delete mockConfig['DATABASE_URL'];
    delete mockConfig['JWT_SECRET'];

    expect(() => service.validateCriticalEnvs(CRITICAL_ENV_VARS)).toThrow(
      'Missing or empty critical environment variable(s): DATABASE_URL, JWT_SECRET',
    );
  });

  it('should throw an error when a critical env var is empty or whitespace', () => {
    for (const key of CRITICAL_ENV_VARS) {
      mockConfig[key] = 'valid_value';
    }
    mockConfig['STELLAR_SIGNER_SECRET'] = '   ';

    expect(() => service.validateCriticalEnvs(CRITICAL_ENV_VARS)).toThrow(
      'Missing or empty critical environment variable(s): STELLAR_SIGNER_SECRET',
    );
  });

  it('should not leak secret values in the error message', () => {
    for (const key of CRITICAL_ENV_VARS) {
      mockConfig[key] = 'my_super_secret_password_123';
    }
    delete mockConfig['JWT_SECRET'];

    try {
      service.validateCriticalEnvs(CRITICAL_ENV_VARS);
    } catch (error) {
      const err = error as Error;
      expect(err.message).toContain('JWT_SECRET');
      expect(err.message).not.toContain('my_super_secret_password_123');
    }
  });
});
