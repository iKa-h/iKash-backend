import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsUUID()
  providerId: string;

  @IsString()
  accountIdentifier: string;

  @IsOptional()
  @IsString()
  beneficiaryName?: string;

  @IsOptional()
  @IsString()
  identificationNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
