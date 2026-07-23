CREATE TABLE blockchain_event_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  contract_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  escrow_id TEXT NOT NULL,
  transaction_hash TEXT,
  ledger_sequence INTEGER,
  event_index INTEGER,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
