import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaginationDto } from '../../common/pagination.dto';
import { AppException, ErrorCode } from '../../common/errors';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethodValidatorService } from './payment-method-validator.service';
import { PaymentMethodsRepository } from './payment-methods.repository';
import { maskAccountIdentifier } from './utils/mask-account-identifier.util';

@Injectable()
export class PaymentMethodsService {
  private readonly logger = new Logger(PaymentMethodsService.name);

  constructor(
    private readonly repo: PaymentMethodsRepository,
    private readonly prisma: PrismaService,
    private readonly validator: PaymentMethodValidatorService,
  ) {}

  async create(
    userId: string,
    dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const provider = await this.getProviderOrThrow(dto.providerId);
    this.validator.validate(provider, dto.accountIdentifier);

    const created = (await this.repo.create({
      userId,
      providerId: dto.providerId,
      type: provider.type,
      accountIdentifier: dto.accountIdentifier.trim(),
      beneficiaryName: dto.beneficiaryName,
      identificationNumber: dto.identificationNumber,
      description: dto.description,
    })) as PaymentMethod;

    this.logger.log({
      event: 'paymentMethod.created',
      userId,
      paymentMethodId: created.paymentId,
      providerId: created.providerId,
      accountIdentifier: maskAccountIdentifier(created.accountIdentifier),
    });

    return created;
  }

  list(p: PaginationDto): Promise<PaymentMethod[]> {
    return this.repo.findMany({ skip: p.skip, take: p.take }) as Promise<
      PaymentMethod[]
    >;
  }

  async get(id: string): Promise<PaymentMethod> {
    const item = (await this.repo.findById(id)) as PaymentMethod;
    if (!item) {
      throw new AppException(
        ErrorCode.PAYMENT_METHOD_NOT_FOUND,
        `Payment method ${id} not found`,
      );
    }
    return item;
  }

  async update(
    id: string,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const existing = await this.get(id);
    const providerId = dto.providerId ?? existing.providerId;
    const accountIdentifier =
      dto.accountIdentifier ?? existing.accountIdentifier;

    if (dto.providerId !== undefined || dto.accountIdentifier !== undefined) {
      const provider = await this.getProviderOrThrow(providerId);
      this.validator.validate(provider, accountIdentifier);
    }

    const data: Record<string, unknown> = { ...dto };
    if (dto.accountIdentifier !== undefined) {
      data.accountIdentifier = dto.accountIdentifier.trim();
    }
    if (dto.providerId !== undefined) {
      const provider = await this.getProviderOrThrow(dto.providerId);
      data.type = provider.type;
    }

    const updated = (await this.repo.update(id, data)) as PaymentMethod;

    this.logger.log({
      event: 'paymentMethod.updated',
      userId: updated.userId,
      paymentMethodId: updated.paymentId,
      providerId: updated.providerId,
      accountIdentifier: maskAccountIdentifier(updated.accountIdentifier),
    });

    return updated;
  }

  remove(id: string): Promise<PaymentMethod> {
    return this.repo.delete(id) as Promise<PaymentMethod>;
  }

  private async getProviderOrThrow(providerId: string) {
    const provider = await this.prisma.payment_provider.findUnique({
      where: { provider_id: providerId },
    });

    if (!provider) {
      throw new AppException(
        ErrorCode.PAYMENT_PROVIDER_NOT_FOUND,
        'Payment provider not found',
      );
    }

    return provider;
  }
}
