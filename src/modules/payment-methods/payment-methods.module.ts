import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodValidatorService } from './payment-method-validator.service';
import { PaymentMethodsRepository } from './payment-methods.repository';
import { PaymentMethodsService } from './payment-methods.service';

@Module({
  imports: [AuthModule],
  controllers: [PaymentMethodsController],
  providers: [
    PaymentMethodsService,
    PaymentMethodsRepository,
    PaymentMethodValidatorService,
  ],
  exports: [PaymentMethodsService, PaymentMethodValidatorService],
})
export class PaymentMethodsModule {}
