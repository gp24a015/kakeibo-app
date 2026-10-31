BEGIN;

CREATE TABLE IF NOT EXISTS guest_sessions (
  id UUID PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE transactions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS guest_id UUID
  REFERENCES guest_sessions(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_exactly_one_owner'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_exactly_one_owner
      CHECK (
        (user_id IS NOT NULL AND guest_id IS NULL)
        OR (user_id IS NULL AND guest_id IS NOT NULL)
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS transactions_guest_id_idx
  ON transactions(guest_id);

CREATE INDEX IF NOT EXISTS guest_sessions_expires_at_idx
  ON guest_sessions(expires_at);

COMMIT;
