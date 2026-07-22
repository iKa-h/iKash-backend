import { payment_provider_type } from '@prisma/client';

export type PaymentProviderLike = {
  name: string;
  type: payment_provider_type;
  country_code: string | null;
  metadata: unknown;
};

export type AccountIdentifierValidator = (
  accountIdentifier: string,
  provider: PaymentProviderLike,
) => boolean;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVP_KEY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

export function isValidSinpePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 8) {
    return /^[2-9]\d{7}$/.test(digits);
  }
  if (digits.length === 11 && digits.startsWith('506')) {
    return /^506[2-9]\d{7}$/.test(digits);
  }
  return false;
}

export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return false;
  }
  if (iban.length < 15 || iban.length > 34) {
    return false;
  }

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (char) =>
    String(char.charCodeAt(0) - 55),
  );

  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }

  return remainder === 1;
}

export function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (base: string, factor: number): number => {
    let total = 0;
    for (let i = 0; i < base.length; i += 1) {
      total += Number(base[i]) * (factor - i);
    }
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const firstDigit = calculateDigit(cpf.slice(0, 9), 10);
  const secondDigit = calculateDigit(cpf.slice(0, 10), 11);

  return firstDigit === Number(cpf[9]) && secondDigit === Number(cpf[10]);
}

export function isValidBrazilianPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return /^[1-9]{2}9\d{8}$/.test(digits);
  }
  if (digits.length === 13 && digits.startsWith('55')) {
    return /^55[1-9]{2}9\d{8}$/.test(digits);
  }
  return false;
}

export function isValidPixKey(value: string): boolean {
  const trimmed = value.trim();
  return (
    isValidCpf(trimmed) ||
    isValidEmail(trimmed) ||
    isValidBrazilianPhone(trimmed) ||
    EVP_KEY_REGEX.test(trimmed)
  );
}

export function isValidMobilePhone(
  value: string,
  countryCode?: string | null,
): boolean {
  const digits = value.replace(/\D/g, '');

  if (countryCode === 'VE') {
    return /^\d{10,11}$/.test(digits);
  }

  if (countryCode === 'CR') {
    return isValidSinpePhone(value);
  }

  return digits.length >= 7 && digits.length <= 15;
}

export function isValidBankAccount(value: string): boolean {
  return /^[A-Za-z0-9\-_.\s/]{4,40}$/.test(value.trim());
}

function getUiRequirements(
  metadata: unknown,
): Array<Record<string, unknown>> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const requirements = (metadata as { ui_requirements?: unknown })
    .ui_requirements;
  return Array.isArray(requirements)
    ? (requirements as Array<Record<string, unknown>>)
    : undefined;
}

export function getAccountIdentifierRequirement(
  metadata: unknown,
): Record<string, unknown> | undefined {
  return getUiRequirements(metadata)?.find(
    (requirement) => requirement.db_field === 'account_identifier',
  );
}

export function providerUsesIban(provider: PaymentProviderLike): boolean {
  if (provider.name.toLowerCase().includes('iban')) {
    return true;
  }

  const requirement = getAccountIdentifierRequirement(provider.metadata);
  const labelValue = requirement?.label;
  const label = typeof labelValue === 'string' ? labelValue.toLowerCase() : '';
  return label.includes('iban');
}

export function getMetadataValidationRegex(
  metadata: unknown,
): string | undefined {
  const regex = getAccountIdentifierRequirement(metadata)?.validation_regex;
  return typeof regex === 'string' && regex.length > 0 ? regex : undefined;
}

export const NAMED_PROVIDER_VALIDATORS: Record<
  string,
  AccountIdentifierValidator
> = {
  paypal: (accountIdentifier) => isValidEmail(accountIdentifier),
  'sinpe móvil': (accountIdentifier) => isValidSinpePhone(accountIdentifier),
  'sinpe movil': (accountIdentifier) => isValidSinpePhone(accountIdentifier),
  pix: (accountIdentifier) => isValidPixKey(accountIdentifier),
  'iban bank': (accountIdentifier) => isValidIban(accountIdentifier),
};

export function validateByProviderType(
  accountIdentifier: string,
  provider: PaymentProviderLike,
): boolean {
  switch (provider.type) {
    case 'PLATFORM':
      return isValidEmail(accountIdentifier);
    case 'MOBILE':
      return isValidMobilePhone(accountIdentifier, provider.country_code);
    case 'BANK':
      if (providerUsesIban(provider)) {
        return isValidIban(accountIdentifier);
      }
      return isValidBankAccount(accountIdentifier);
    default:
      return false;
  }
}

export function isValidAccountIdentifier(
  accountIdentifier: string,
  provider: PaymentProviderLike,
): boolean {
  const trimmed = accountIdentifier.trim();
  if (!trimmed) {
    return false;
  }

  const normalizedName = provider.name.trim().toLowerCase();
  const namedValidator = NAMED_PROVIDER_VALIDATORS[normalizedName];
  if (namedValidator) {
    return namedValidator(trimmed, provider);
  }

  const metadataRegex = getMetadataValidationRegex(provider.metadata);
  if (metadataRegex) {
    try {
      return new RegExp(metadataRegex).test(trimmed);
    } catch {
      return false;
    }
  }

  return validateByProviderType(trimmed, provider);
}
