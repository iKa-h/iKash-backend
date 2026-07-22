import { Injectable } from '@nestjs/common';
import { AppException, ErrorCode } from '../../common/errors';
import {
  AccountIdentifierValidator,
  isValidAccountIdentifier,
  NAMED_PROVIDER_VALIDATORS,
  PaymentProviderLike,
} from './validators/account-identifier.validators';

@Injectable()
export class PaymentMethodValidatorService {
  private readonly namedValidators = new Map<string, AccountIdentifierValidator>(
    Object.entries(NAMED_PROVIDER_VALIDATORS),
  );

  registerValidator(
    providerName: string,
    validator: AccountIdentifierValidator,
  ): void {
    this.namedValidators.set(providerName.trim().toLowerCase(), validator);
  }

  validate(provider: PaymentProviderLike, accountIdentifier: string): void {
    if (!this.isValid(provider, accountIdentifier)) {
      throw new AppException(
        ErrorCode.INVALID_ACCOUNT_IDENTIFIER,
        'Invalid account identifier for the selected payment provider.',
      );
    }
  }

  isValid(provider: PaymentProviderLike, accountIdentifier: string): boolean {
    const trimmed = accountIdentifier.trim();
    if (!trimmed) {
      return false;
    }

    const normalizedName = provider.name.trim().toLowerCase();
    const namedValidator = this.namedValidators.get(normalizedName);
    if (namedValidator) {
      return namedValidator(trimmed, provider);
    }

    return isValidAccountIdentifier(trimmed, provider);
  }
}
