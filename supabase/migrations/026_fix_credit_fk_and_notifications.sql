-- 026_fix_credit_fk_and_notifications.sql
-- Fix 1: Add FK from credit_transactions.order_id to orders.id
--        so PostgREST can resolve the relationship for joins
-- Fix 2: Ensure notifications.body allows NULL (may have been changed via dashboard)

-- ── 1. Add FK constraint on credit_transactions.order_id ─────────────────────

-- First clean up any orphaned order_ids that reference non-existent orders
UPDATE public.credit_transactions
SET order_id = NULL
WHERE order_id IS NOT NULL
  AND order_id NOT IN (SELECT id FROM public.orders);

-- Add the foreign key constraint (drop first if it already exists)
DO $$ BEGIN
  ALTER TABLE public.credit_transactions
    ADD CONSTRAINT credit_transactions_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ── 2. Fix notifications.body to allow NULL with a default ───────────────────

ALTER TABLE public.notifications
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN body SET DEFAULT '';
