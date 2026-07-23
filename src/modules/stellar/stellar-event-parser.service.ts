import { Injectable, Logger } from '@nestjs/common';

export interface StellarContractEvent {
  contractId?: string;
  eventType?: string;
  escrowId?: string;
  transactionHash?: string;
  ledgerSequence?: number;
  eventIndex?: number;
  [key: string]: unknown;
}

export interface ParsedStellarEvent extends StellarContractEvent {
  contractId: string;
  eventType: string;
  escrowId: string;
  transactionHash: string;
  ledgerSequence: number;
  eventIndex: number;
}

@Injectable()
export class StellarEventParserService {
  private readonly logger = new Logger(StellarEventParserService.name);

  parse(
    event: StellarContractEvent | null | undefined,
    expectedContractId?: string,
  ): ParsedStellarEvent | null {
    if (!event || !expectedContractId) {
      return null;
    }

    const contractId = event.contractId?.toString();
    if (!contractId || contractId !== expectedContractId) {
      return null;
    }

    const eventType = event.eventType?.toString();
    const escrowId = event.escrowId?.toString();
    const txHash = event.transactionHash?.toString();
    const ledgerSequence = Number(event.ledgerSequence ?? 0);
    const eventIndex = Number(event.eventIndex ?? 0);

    if (!eventType || !escrowId || !txHash) {
      this.logger.warn('Ignoring malformed Stellar event payload');
      return null;
    }

    if (!Number.isFinite(ledgerSequence) || !Number.isFinite(eventIndex)) {
      this.logger.warn('Ignoring event with invalid ledger/event indices');
      return null;
    }

    return {
      ...event,
      contractId,
      eventType,
      escrowId,
      transactionHash: txHash,
      ledgerSequence,
      eventIndex,
    };
  }
}
