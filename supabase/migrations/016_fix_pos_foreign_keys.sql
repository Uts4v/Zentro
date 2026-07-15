-- 016_fix_pos_foreign_keys.sql
-- Fix: FKs referencing auth.users can't be joined by PostgREST.
-- Recreate them pointing to public.profiles(id) instead.

-- cash_shifts.opened_by
ALTER TABLE public.cash_shifts
  DROP CONSTRAINT IF EXISTS cash_shifts_opened_by_fkey,
  ALTER COLUMN opened_by DROP NOT NULL,
  ALTER COLUMN opened_by SET DATA TYPE uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_shifts_opened_by_fkey'
  ) THEN
    ALTER TABLE public.cash_shifts
      ADD CONSTRAINT cash_shifts_opened_by_fkey
      FOREIGN KEY (opened_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- cash_shifts.closed_by
ALTER TABLE public.cash_shifts
  DROP CONSTRAINT IF EXISTS cash_shifts_closed_by_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_shifts_closed_by_fkey'
  ) THEN
    ALTER TABLE public.cash_shifts
      ADD CONSTRAINT cash_shifts_closed_by_fkey
      FOREIGN KEY (closed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- cash_drops.recorded_by
ALTER TABLE public.cash_drops
  DROP CONSTRAINT IF EXISTS cash_drops_recorded_by_fkey,
  ALTER COLUMN recorded_by DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_drops_recorded_by_fkey'
  ) THEN
    ALTER TABLE public.cash_drops
      ADD CONSTRAINT cash_drops_recorded_by_fkey
      FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- credit_transactions.recorded_by
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_recorded_by_fkey,
  ALTER COLUMN recorded_by DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_recorded_by_fkey'
  ) THEN
    ALTER TABLE public.credit_transactions
      ADD CONSTRAINT credit_transactions_recorded_by_fkey
      FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- orders.processed_by
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_processed_by_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_processed_by_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_processed_by_fkey
      FOREIGN KEY (processed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
