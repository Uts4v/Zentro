-- 022_remove_staff_system.sql
-- Remove staff_accounts table and all related RPCs.
-- Merchant uses their own account for POS directly.
-- Idempotent: safe to re-run.

-- Drop RPCs first (they depend on staff_accounts)
DROP FUNCTION IF EXISTS public.create_staff_account(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.create_staff_account(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.find_staff_by_email(text);

-- Drop staff_accounts table (cascades policies, trigger, etc.)
DROP TABLE IF EXISTS public.staff_accounts CASCADE;

-- Drop old staff policies (if they still exist)
DROP POLICY IF EXISTS "Staff can read own merchant shifts" ON public.cash_shifts;
DROP POLICY IF EXISTS "Staff can create shifts" ON public.cash_shifts;
DROP POLICY IF EXISTS "Staff can update own merchant shifts" ON public.cash_shifts;
DROP POLICY IF EXISTS "Staff can read own merchant cash_drops" ON public.cash_drops;
DROP POLICY IF EXISTS "Staff can insert own merchant cash_drops" ON public.cash_drops;
DROP POLICY IF EXISTS "Staff can read own merchant credit_accounts" ON public.credit_accounts;
DROP POLICY IF EXISTS "Staff can manage own merchant credit_accounts" ON public.credit_accounts;
DROP POLICY IF EXISTS "Staff can read own merchant credit_transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Staff can insert own merchant credit_transactions" ON public.credit_transactions;

-- Drop new merchant policies (if they already exist from a partial run)
DROP POLICY IF EXISTS "Merchant can read own shifts" ON public.cash_shifts;
DROP POLICY IF EXISTS "Merchant can create shifts" ON public.cash_shifts;
DROP POLICY IF EXISTS "Merchant can update own shifts" ON public.cash_shifts;
DROP POLICY IF EXISTS "Merchant can read own cash_drops" ON public.cash_drops;
DROP POLICY IF EXISTS "Merchant can insert own cash_drops" ON public.cash_drops;
DROP POLICY IF EXISTS "Merchant can read own credit_accounts" ON public.credit_accounts;
DROP POLICY IF EXISTS "Merchant can manage own credit_accounts" ON public.credit_accounts;
DROP POLICY IF EXISTS "Merchant can read own credit_transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Merchant can insert own credit_transactions" ON public.credit_transactions;

-- ── Create clean merchant-only policies ─────────────────────────────────────

-- cash_shifts
CREATE POLICY "Merchant can read own shifts"
ON public.cash_shifts FOR SELECT TO authenticated
USING (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Merchant can create shifts"
ON public.cash_shifts FOR INSERT TO authenticated
WITH CHECK (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Merchant can update own shifts"
ON public.cash_shifts FOR UPDATE TO authenticated
USING (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
);

-- cash_drops
CREATE POLICY "Merchant can read own cash_drops"
ON public.cash_drops FOR SELECT TO authenticated
USING (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Merchant can insert own cash_drops"
ON public.cash_drops FOR INSERT TO authenticated
WITH CHECK (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
);

-- credit_accounts
CREATE POLICY "Merchant can read own credit_accounts"
ON public.credit_accounts FOR SELECT TO authenticated
USING (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Merchant can manage own credit_accounts"
ON public.credit_accounts FOR ALL TO authenticated
USING (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
);

-- credit_transactions
CREATE POLICY "Merchant can read own credit_transactions"
ON public.credit_transactions FOR SELECT TO authenticated
USING (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Merchant can insert own credit_transactions"
ON public.credit_transactions FOR INSERT TO authenticated
WITH CHECK (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
);
