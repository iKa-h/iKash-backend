import { payment_provider_type } from '@prisma/client';
import { AppException, ErrorCode } from '../../common/errors';
import { PaymentMethodValidatorService } from './payment-method-validator.service';

describe('PaymentMethodValidatorService', () => {
  let service: PaymentMethodValidatorService;

  beforeEach(() => {
    service = new PaymentMethodValidatorService();
  });

  it('registers new provider validators without changing existing ones', () => {
    service.registerValidator('custom provider', () => true);

    expect(
      service.isValid(
        {
          name: 'custom provider',
          type: 'PLATFORM',
          country_code: null,
          metadata: null,
        },
        'anything',
      ),
    ).toBe(true);
    expect(
      service.isValid(
        {
          name: 'PayPal',
          type: 'PLATFORM',
          country_code: null,
          metadata: null,
        },
        'not-an-email',
      ),
    ).toBe(false);
  });

  it('throws INVALID_ACCOUNT_IDENTIFIER when validation fails', () => {
    expect(() =>
      service.validate(
        {
          name: 'PayPal',
          type: 'PLATFORM' as payment_provider_type,
          country_code: null,
          metadata: null,
        },
        'invalid-email',
      ),
    ).toThrow(AppException);

    try {
      service.validate(
        {
          name: 'PayPal',
          type: 'PLATFORM',
          country_code: null,
          metadata: null,
        },
        'invalid-email',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getResponse()).toEqual({
        statusCode: 400,
        error: ErrorCode.INVALID_ACCOUNT_IDENTIFIER,
        message:
          'Invalid account identifier for the selected payment provider.',
      });
    }
  });
});
