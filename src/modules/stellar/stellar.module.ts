import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { EscrowModule } from '../escrow/escrow.module';
import { OrderModule } from '../order/order.module';
import { StellarController } from './stellar.controller';
import { StellarEventParserService } from './stellar-event-parser.service';
import { StellarListenerService } from './stellar-listener.service';
import { StellarService } from './stellar.service';

@Module({
  imports: [ConfigModule, PrismaModule, EscrowModule, OrderModule],
  providers: [
    StellarService,
    StellarEventParserService,
    StellarListenerService,
  ],
  controllers: [StellarController],
  exports: [StellarService],
})
export class StellarModule {}
