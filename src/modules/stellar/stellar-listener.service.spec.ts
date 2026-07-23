import { ConfigService } from '@nestjs/config';
import { StellarEventParserService } from './stellar-event-parser.service';
import { StellarListenerService } from './stellar-listener.service';

describe('StellarEventParserService', () => {
  it('parses and validates supported contract events', () => {
    const parser = new StellarEventParserService();
    const event = parser.parse(
      {
        contractId: 'CC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF',
        eventType: 'ESCROW_FUNDED',
        escrowId: 'escrow-123',
        transactionHash: 'tx-123',
        ledgerSequence: 42,
        eventIndex: 2,
      },
      'CC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF',
    );

    expect(event).toEqual(
      expect.objectContaining({
        eventType: 'ESCROW_FUNDED',
        escrowId: 'escrow-123',
        transactionHash: 'tx-123',
        ledgerSequence: 42,
        eventIndex: 2,
      }),
    );
  });

  it('rejects events from a different contract', () => {
    const parser = new StellarEventParserService();
    const event = parser.parse(
      {
        contractId: 'CCOTHER',
        eventType: 'ESCROW_FUNDED',
        escrowId: 'escrow-123',
      },
      'CC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF',
    );

    expect(event).toBeNull();
  });
});

describe('StellarListenerService', () => {
  it('maps lifecycle events to the expected escrow and order states', () => {
    const config = {
      get: (key: string) => {
        switch (key) {
          case 'TRUSTLESS_WORK_CONTRACT_ID':
            return 'CC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF';
          case 'STELLAR_LISTENER_POLL_MS':
            return '5000';
          default:
            return undefined;
        }
      },
    } as unknown as ConfigService;

    const service = new StellarListenerService(
      config,
      new StellarEventParserService(),
      {} as never,
      {} as never,
    );

    expect(service.mapEventToStatuses('ESCROW_FUNDED')).toEqual({
      escrowStatus: 'funded',
      orderStatus: 'locked',
    });
    expect(service.mapEventToStatuses('ESCROW_RELEASED')).toEqual({
      escrowStatus: 'released',
      orderStatus: 'released',
    });
    expect(service.mapEventToStatuses('ESCROW_REFUNDED')).toEqual({
      escrowStatus: 'resolved',
      orderStatus: 'cancelled',
    });
    expect(service.mapEventToStatuses('ESCROW_DISPUTED')).toEqual({
      escrowStatus: 'disputed',
      orderStatus: 'disputed',
    });
  });
});
