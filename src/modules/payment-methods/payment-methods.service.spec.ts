import { Test, TestingModule } from '@nestjs/testing';
import { payment_provider_type } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AppException, ErrorCode } from '../../common/errors';
import { PaymentMethodValidatorService } from './payment-method-validator.service';
import { PaymentMethodsRepository } from './payment-methods.repository';
import { PaymentMethodsService } from './payment-methods.service';

describe('PaymentMethodsService', () => {
  let service: PaymentMethodsService;
  let repo: {
    create: jest.Mock;
    update: jest.Mock;
    findById: jest.Mock;
  };
  let prisma: {
    payment_provider: {
      findUnique: jest.Mock;
    };
  };

  const paypalProvider = {
    provider_id: 'provider-1',
    name: 'PayPal',
    type: 'PLATFORM' as payment_provider_type,
    country_code: '',
    metadata: null,
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
    };
    prisma = {
      payment_provider: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMethodsService,
        PaymentMethodValidatorService,
        { provide: PaymentMethodsRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PaymentMethodsService);
  });

  describe('create', () => {
    it('creates a payment method when the account identifier is valid', async () => {
      prisma.payment_provider.findUnique.mockResolvedValue(paypalProvider);
      repo.create.mockResolvedValue({
        paymentId: 'payment-1',
        accountIdentifier: 'user@example.com',
      });

      await expect(
        service.create('user-1', {
          providerId: 'provider-1',
          accountIdentifier: 'user@example.com',
        }),
      ).resolves.toEqual({
        paymentId: 'payment-1',
        accountIdentifier: 'user@example.com',
      });

      expect(repo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        providerId: 'provider-1',
        type: 'PLATFORM',
        accountIdentifier: 'user@example.com',
        beneficiaryName: undefined,
        identificationNumber: undefined,
        description: undefined,
      });
    });

    it('rejects invalid account identifiers before saving', async () => {
      prisma.payment_provider.findUnique.mockResolvedValue(paypalProvider);

      await expect(
        service.create('user-1', {
          providerId: 'provider-1',
          accountIdentifier: 'not-an-email',
        }),
      ).rejects.toMatchObject({
        response: {
          statusCode: 400,
          error: ErrorCode.INVALID_ACCOUNT_IDENTIFIER,
          message:
            'Invalid account identifier for the selected payment provider.',
        },
      });

      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects invalid account identifiers before updating', async () => {
      repo.findById.mockResolvedValue({
        paymentId: 'payment-1',
        providerId: 'provider-1',
        accountIdentifier: 'user@example.com',
      });
      prisma.payment_provider.findUnique.mockResolvedValue(paypalProvider);

      await expect(
        service.update('payment-1', {
          accountIdentifier: 'invalid-email',
        }),
      ).rejects.toBeInstanceOf(AppException);

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('updates a payment method when the account identifier is valid', async () => {
      repo.findById.mockResolvedValue({
        paymentId: 'payment-1',
        providerId: 'provider-1',
        accountIdentifier: 'user@example.com',
      });
      prisma.payment_provider.findUnique.mockResolvedValue(paypalProvider);
      repo.update.mockResolvedValue({
        paymentId: 'payment-1',
        accountIdentifier: 'other@example.com',
      });

      await expect(
        service.update('payment-1', {
          accountIdentifier: 'other@example.com',
        }),
      ).resolves.toEqual({
        paymentId: 'payment-1',
        accountIdentifier: 'other@example.com',
      });
    });
  });
});
