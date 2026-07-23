import { payment_provider_type } from '@prisma/client';
import {
  isValidAccountIdentifier,
  isValidBrazilianPhone,
  isValidCpf,
  isValidEmail,
  isValidIban,
  isValidPixKey,
  isValidSinpePhone,
  PaymentProviderLike,
} from './account-identifier.validators';

const provider = (
  name: string,
  type: payment_provider_type,
  country_code: string | null = null,
  metadata: unknown = null,
): PaymentProviderLike => ({
  name,
  type,
  country_code,
  metadata,
});

describe('account identifier validators', () => {
  describe('isValidEmail', () => {
    it('accepts valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
    });
  });

  describe('isValidSinpePhone', () => {
    it('accepts 8-digit Costa Rican numbers', () => {
      expect(isValidSinpePhone('88887777')).toBe(true);
    });

    it('accepts numbers with +506 prefix', () => {
      expect(isValidSinpePhone('+50688887777')).toBe(true);
    });

    it('rejects invalid numbers', () => {
      expect(isValidSinpePhone('123')).toBe(false);
    });
  });

  describe('isValidIban', () => {
    it('accepts a valid IBAN', () => {
      expect(isValidIban('DE89370400440532013000')).toBe(true);
    });

    it('rejects invalid IBAN checksums', () => {
      expect(isValidIban('DE89370400440532013001')).toBe(false);
    });
  });

  describe('isValidCpf', () => {
    it('accepts a valid CPF', () => {
      expect(isValidCpf('52998224725')).toBe(true);
    });

    it('rejects invalid CPF values', () => {
      expect(isValidCpf('11111111111')).toBe(false);
    });
  });

  describe('isValidBrazilianPhone', () => {
    it('accepts 11-digit Brazilian mobile numbers', () => {
      expect(isValidBrazilianPhone('11987654321')).toBe(true);
    });

    it('accepts numbers with country code', () => {
      expect(isValidBrazilianPhone('+5511987654321')).toBe(true);
    });
  });

  describe('isValidPixKey', () => {
    it('accepts CPF keys', () => {
      expect(isValidPixKey('52998224725')).toBe(true);
    });

    it('accepts email keys', () => {
      expect(isValidPixKey('pix@example.com')).toBe(true);
    });

    it('accepts phone keys', () => {
      expect(isValidPixKey('11987654321')).toBe(true);
    });

    it('accepts random EVP keys', () => {
      expect(isValidPixKey('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('rejects unsupported values', () => {
      expect(isValidPixKey('invalid-key')).toBe(false);
    });
  });

  describe('isValidAccountIdentifier', () => {
    it('validates PayPal with email rules', () => {
      expect(
        isValidAccountIdentifier(
          'user@example.com',
          provider('PayPal', 'PLATFORM'),
        ),
      ).toBe(true);
      expect(
        isValidAccountIdentifier('bad-value', provider('PayPal', 'PLATFORM')),
      ).toBe(false);
    });

    it('validates SINPE Móvil with Costa Rican phone rules', () => {
      expect(
        isValidAccountIdentifier(
          '88887777',
          provider('SINPE Móvil', 'MOBILE', 'CR'),
        ),
      ).toBe(true);
      expect(
        isValidAccountIdentifier(
          '123',
          provider('SINPE Móvil', 'MOBILE', 'CR'),
        ),
      ).toBe(false);
    });

    it('validates IBAN Bank with IBAN rules', () => {
      expect(
        isValidAccountIdentifier(
          'DE89370400440532013000',
          provider('IBAN Bank', 'BANK', 'DE'),
        ),
      ).toBe(true);
    });

    it('validates Pix with supported key formats', () => {
      expect(
        isValidAccountIdentifier(
          '52998224725',
          provider('Pix', 'PLATFORM', 'BR'),
        ),
      ).toBe(true);
    });

    it('falls back to provider type when no named rule exists', () => {
      expect(
        isValidAccountIdentifier(
          '04121234567',
          provider('Pago Movil', 'MOBILE', 'VE'),
        ),
      ).toBe(true);
      expect(
        isValidAccountIdentifier('123', provider('Pago Movil', 'MOBILE', 'VE')),
      ).toBe(false);
    });

    it('uses metadata validation_regex when provided', () => {
      const metadata = {
        ui_requirements: [
          {
            db_field: 'account_identifier',
            validation_regex: '^ACC-\\d{4}$',
          },
        ],
      };

      expect(
        isValidAccountIdentifier(
          'ACC-1234',
          provider('Custom Bank', 'BANK', 'US', metadata),
        ),
      ).toBe(true);
      expect(
        isValidAccountIdentifier(
          'WRONG',
          provider('Custom Bank', 'BANK', 'US', metadata),
        ),
      ).toBe(false);
    });

    it('uses IBAN validation when provider metadata mentions IBAN', () => {
      const metadata = {
        ui_requirements: [
          {
            db_field: 'account_identifier',
            label: 'Número de cuenta/IBAN',
          },
        ],
      };

      expect(
        isValidAccountIdentifier(
          'DE89370400440532013000',
          provider('Banco General', 'BANK', 'PA', metadata),
        ),
      ).toBe(true);
    });
  });
});
