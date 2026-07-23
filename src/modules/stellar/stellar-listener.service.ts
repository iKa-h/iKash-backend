import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { EscrowRepository } from '../escrow/escrow.repository';
import { OrderRepository } from '../order/order.repository';
import {
  ParsedStellarEvent,
  StellarEventParserService,
} from './stellar-event-parser.service';

export type ListenerEventName =
  | 'ESCROW_CREATED'
  | 'ESCROW_FUNDED'
  | 'ESCROW_RELEASED'
  | 'ESCROW_REFUNDED'
  | 'ESCROW_CANCELLED'
  | 'ESCROW_DISPUTED';

interface EscrowRecordLike {
  escrowId: string;
  orderId: string;
  contractId?: string | null;
  escrowStatus?: string | null;
}

@Injectable()
export class StellarListenerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(StellarListenerService.name);
  private readonly contractId: string;
  private readonly pollMs: number;
  private readonly processedEventKeys = new Set<string>();
  private readonly pendingEvents: ParsedStellarEvent[] = [];
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly parser: StellarEventParserService,
    private readonly prisma: PrismaService,
    private readonly escrowRepo: EscrowRepository,
    private readonly orderRepo?: OrderRepository,
  ) {
    this.contractId = this.config.get<string>(
      'TRUSTLESS_WORK_CONTRACT_ID',
      'CC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF',
    );
    this.pollMs = Number(
      this.config.get<string>('STELLAR_LISTENER_POLL_MS', '5000'),
    );
  }

  async onModuleInit() {
    if (this.running) {
      return;
    }

    this.running = true;
    void this.start();
  }

  onModuleDestroy() {
    this.running = false;
  }

  async enqueueEvent(event: ParsedStellarEvent | null | undefined) {
    const parsed = this.parser.parse(event, this.contractId);
    if (!parsed) {
      return;
    }

    this.pendingEvents.push(parsed);
  }

  private async start(): Promise<void> {
    while (this.running) {
      try {
        await this.pollForEvents();
      } catch (error) {
        this.logger.error('Listener loop failed', error);
      }

      await this.delay(this.pollMs);
    }
  }

  async pollForEvents(): Promise<void> {
    while (this.pendingEvents.length > 0) {
      const event = this.pendingEvents.shift();
      if (!event) {
        continue;
      }

      const eventKey = this.buildEventKey(event);
      if (this.processedEventKeys.has(eventKey)) {
        continue;
      }

      await this.processEvent(event);
      this.processedEventKeys.add(eventKey);
    }
  }

  async processEvent(event: ParsedStellarEvent): Promise<void> {
    const eventKey = this.buildEventKey(event);
    if (this.processedEventKeys.has(eventKey)) {
      return;
    }

    try {
      const existingSync = await this.prisma.blockchainEventSync.findUnique({
        where: { eventKey },
      });
      if (existingSync) {
        this.processedEventKeys.add(eventKey);
        return;
      }

      const escrow = await this.resolveEscrow(event);
      if (!escrow) {
        this.logger.warn(`No local escrow found for ${event.escrowId}`);
        return;
      }

      const statusMapping = this.mapEventToStatuses(event.eventType as ListenerEventName);
      if (!statusMapping) {
        this.logger.debug(`Unsupported event type: ${event.eventType}`);
        return;
      }

      const currentEscrowStatus = escrow.escrowStatus ?? 'pending';
      const currentOrderStatus = (await this.orderRepo?.findById(escrow.orderId))?.orderStatus ?? 'created';
      const shouldSkipEscrowUpdate = this.shouldSkipStatusUpdate(
        currentEscrowStatus,
        statusMapping.escrowStatus,
      );
      const shouldSkipOrderUpdate = this.shouldSkipStatusUpdate(
        currentOrderStatus,
        statusMapping.orderStatus,
      );

      const updateData: Record<string, unknown> = {};
      if (!shouldSkipEscrowUpdate) {
        updateData.escrowStatus = statusMapping.escrowStatus;
      }

      const txField = event.eventType === 'ESCROW_RELEASED' ? 'txHashRelease' : 'txHashLock';
      if (event.transactionHash && !shouldSkipEscrowUpdate) {
        updateData[txField] = event.transactionHash;
      }

      if (Object.keys(updateData).length > 0) {
        await this.escrowRepo.update(escrow.escrowId, updateData);
      }

      if (this.orderRepo && !shouldSkipOrderUpdate) {
        await this.orderRepo.update(escrow.orderId, {
          orderStatus: statusMapping.orderStatus,
        });
      }

      await this.prisma.blockchainEventSync.create({
        data: {
          eventKey,
          contractId: event.contractId,
          eventType: event.eventType,
          escrowId: escrow.escrowId,
          transactionHash: event.transactionHash,
          ledgerSequence: event.ledgerSequence,
          eventIndex: event.eventIndex,
        },
      });

      this.processedEventKeys.add(eventKey);
      await this.notifyParticipants(escrow, event);
      this.logger.log(
        `Processed ${event.eventType} for escrow ${escrow.escrowId}`,
      );
    } catch (error) {
      this.logger.error(`Failed while processing event ${event.eventType}`, error);
    }
  }

  mapEventToStatuses(eventType: ListenerEventName | string):
    | { escrowStatus: string; orderStatus: string }
    | null {
    const mapping: Record<string, { escrowStatus: string; orderStatus: string }> = {
      ESCROW_CREATED: { escrowStatus: 'initialized', orderStatus: 'created' },
      ESCROW_FUNDED: { escrowStatus: 'funded', orderStatus: 'locked' },
      ESCROW_RELEASED: { escrowStatus: 'released', orderStatus: 'released' },
      ESCROW_REFUNDED: { escrowStatus: 'resolved', orderStatus: 'cancelled' },
      ESCROW_CANCELLED: { escrowStatus: 'resolved', orderStatus: 'cancelled' },
      ESCROW_DISPUTED: { escrowStatus: 'disputed', orderStatus: 'disputed' },
    };

    return mapping[eventType] ?? null;
  }

  private shouldSkipStatusUpdate(currentStatus: string, nextStatus: string): boolean {
    const terminalStatuses = new Set(['released', 'resolved', 'disputed']);

    if (terminalStatuses.has(currentStatus) && currentStatus === nextStatus) {
      return true;
    }

    if (terminalStatuses.has(currentStatus) && currentStatus !== nextStatus) {
      return true;
    }

    return false;
  }

  private async resolveEscrow(event: ParsedStellarEvent): Promise<EscrowRecordLike | null> {
    const candidates = [event.escrowId, event.contractId].filter(Boolean) as string[];

    for (const candidate of candidates) {
      const byId = (await this.escrowRepo.findById(candidate)) as EscrowRecordLike | null;
      if (byId) {
        return byId;
      }

      const byContractId = (await this.escrowRepo.findByContractId(candidate)) as EscrowRecordLike | null;
      if (byContractId) {
        return byContractId;
      }
    }

    return null;
  }

  private async notifyParticipants(
    escrow: EscrowRecordLike,
    event: ParsedStellarEvent,
  ): Promise<void> {
    this.logger.debug(
      `Would notify participants for escrow ${escrow.escrowId} after ${event.eventType}`,
    );
  }

  private buildEventKey(event: ParsedStellarEvent): string {
    return `${event.transactionHash}:${event.ledgerSequence}:${event.eventIndex}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
