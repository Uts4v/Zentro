-- 015_pos_system.sql
-- POS system: staff accounts, shifts, cash movements, credit accounts, payment processing

-- Ensure handle_updated_at trigger function exists
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 1. Staff accounts ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff_accounts (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  merchant_id uuid REFERENCES public.merchant_profiles(id) ON DELETE CASCADE NOT NULL,
  full_name   text NOT NULL,
  role        text NOT NULL DEFAULT 'cashier' CHECK (role IN ('cashier', 'manager', 'kitchen')),
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.staff_accounts ENABLE ROW LEVEL SECURITY;

-- Staff can read their own row
CREATE POLICY "Staff can read own account"
ON public.staff_accounts FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Merchants manage staff for their own store
CREATE POLICY "Merchants manage own staff"
ON public.staff_accounts FOR ALL TO authenticated
USING (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
);

CREATE TRIGGER set_staff_accounts_updated_at
  BEFORE UPDATE ON public.staff_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 2. Cash shifts ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cash_shifts (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id         uuid REFERENCES public.merchant_profiles(id) ON DELETE CASCADE NOT NULL,
  opened_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_cash        numeric NOT NULL DEFAULT 0,
  closing_cash_actual numeric,
  cash_difference     numeric,
  opened_at           timestamptz DEFAULT now(),
  closed_at           timestamptz,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;

-- Staff can read shifts for their merchant
CREATE POLICY "Staff can read own merchant shifts"
ON public.cash_shifts FOR SELECT TO authenticated
USING (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
  OR merchant_id IN (
    SELECT merchant_id FROM staff_accounts WHERE user_id = auth.uid()
  )
);

-- Staff can insert shifts for their merchant
CREATE POLICY "Staff can create shifts"
ON public.cash_shifts FOR INSERT TO authenticated
WITH CHECK (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
  OR merchant_id IN (
    SELECT merchant_id FROM staff_accounts WHERE user_id = auth.uid()
  )
);

-- Staff can update shifts for their merchant
CREATE POLICY "Staff can update own merchant shifts"
ON public.cash_shifts FOR UPDATE TO authenticated
USING (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
  OR merchant_id IN (
    SELECT merchant_id FROM staff_accounts WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
  OR merchant_id IN (
    SELECT merchant_id FROM staff_accounts WHERE user_id = auth.uid()
  )
);

-- ── 3. Cash drops / payouts ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cash_drops (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id    uuid REFERENCES public.cash_shifts(id) ON DELETE CASCADE NOT NULL,
  merchant_id uuid REFERENCES public.merchant_profiles(id) ON DELETE CASCADE NOT NULL,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount      numeric NOT NULL CHECK (amount > 0),
  direction   text NOT NULL CHECK (direction IN ('drop', 'payout')),
  reason      text NOT NULL DEFAULT '',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.cash_drops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read own merchant cash_drops"
ON public.cash_drops FOR SELECT TO authenticated
USING (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
  OR merchant_id IN (
    SELECT merchant_id FROM staff_accounts WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Staff can insert own merchant cash_drops"
ON public.cash_drops FOR INSERT TO authenticated
WITH CHECK (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
  OR merchant_id IN (
    SELECT merchant_id FROM staff_accounts WHERE user_id = auth.uid()
  )
);

-- ── 4. Credit accounts ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.credit_accounts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id   uuid REFERENCES public.merchant_profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id   uuid REFERENCES auth.users(id),
  full_name     text NOT NULL,
  phone         text,
  email         text,
  credit_limit  numeric NOT NULL DEFAULT 5000,
  balance       numeric NOT NULL DEFAULT 0,
  notes         text,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.credit_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read own merchant credit_accounts"
ON public.credit_accounts FOR SELECT TO authenticated
USING (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
  OR merchant_id IN (
    SELECT merchant_id FROM staff_accounts WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Staff can manage own merchant credit_accounts"
ON public.credit_accounts FOR ALL TO authenticated
USING (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
  OR merchant_id IN (
    SELECT merchant_id FROM staff_accounts WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
  OR merchant_id IN (
    SELECT merchant_id FROM staff_accounts WHERE user_id = auth.uid()
  )
);

CREATE TRIGGER set_credit_accounts_updated_at
  BEFORE UPDATE ON public.credit_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 5. Credit transactions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_account_id uuid REFERENCES public.credit_accounts(id) ON DELETE CASCADE NOT NULL,
  merchant_id       uuid REFERENCES public.merchant_profiles(id) ON DELETE CASCADE NOT NULL,
  type              text NOT NULL CHECK (type IN ('charge', 'payment')),
  amount            numeric NOT NULL CHECK (amount > 0),
  balance_after     numeric NOT NULL,
  order_id          uuid,
  notes             text,
  recorded_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read own merchant credit_transactions"
ON public.credit_transactions FOR SELECT TO authenticated
USING (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
  OR merchant_id IN (
    SELECT merchant_id FROM staff_accounts WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Staff can insert own merchant credit_transactions"
ON public.credit_transactions FOR INSERT TO authenticated
WITH CHECK (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
  OR merchant_id IN (
    SELECT merchant_id FROM staff_accounts WHERE user_id = auth.uid()
  )
);

-- ── 6. Add POS columns to orders ────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('cash', 'fonepay', 'split', 'credit')),
  ADD COLUMN IF NOT EXISTS cash_received numeric,
  ADD COLUMN IF NOT EXISTS fonepay_amount numeric,
  ADD COLUMN IF NOT EXISTS credit_account_id uuid REFERENCES public.credit_accounts(id),
  ADD COLUMN IF NOT EXISTS receipt_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  ADD COLUMN IF NOT EXISTS is_walk_in boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS walk_in_name text;

-- ── 7. Receipt number generator ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS text AS $$
BEGIN
  RETURN 'RC-' || lpad(nextval('receipt_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Create sequence if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'receipt_seq') THEN
    CREATE SEQUENCE receipt_seq START WITH 100001;
  END IF;
END $$;

-- ── 8. Process payment RPC (atomic) ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.process_payment(
  p_order_id uuid,
  p_payment_method text,
  p_cash_received numeric DEFAULT 0,
  p_fonepay_amount numeric DEFAULT 0,
  p_credit_account_id uuid DEFAULT NULL,
  p_staff_user_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_receipt text;
  v_new_balance numeric;
  v_result jsonb;
BEGIN
  -- Lock the order row to prevent concurrent payments
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'This order has already been paid';
  END IF;

  -- Generate receipt number
  v_receipt := generate_receipt_number();

  -- Handle credit charge
  IF p_payment_method = 'credit' OR (p_payment_method = 'split' AND p_credit_account_id IS NOT NULL) THEN
    SELECT balance INTO v_new_balance
    FROM credit_accounts
    WHERE id = p_credit_account_id
    FOR UPDATE;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Credit account not found';
    END IF;

    -- Calculate credit amount for split
    DECLARE v_credit_amount numeric;
    BEGIN
      IF p_payment_method = 'credit' THEN
        v_credit_amount := v_order.total_amount;
      ELSE
        v_credit_amount := v_order.total_amount - p_cash_received - p_fonepay_amount;
        IF v_credit_amount < 0 THEN v_credit_amount := 0; END IF;
      END IF;

      IF v_new_balance + v_credit_amount > (SELECT credit_limit FROM credit_accounts WHERE id = p_credit_account_id) THEN
        RAISE EXCEPTION 'This charge exceeds the credit limit';
      END IF;

      -- Update credit balance
      UPDATE credit_accounts
      SET balance = balance + v_credit_amount, updated_at = now()
      WHERE id = p_credit_account_id;

      -- Record credit transaction
      INSERT INTO credit_transactions (credit_account_id, merchant_id, type, amount, balance_after, order_id, recorded_by)
      VALUES (
        p_credit_account_id,
        v_order.merchant_id,
        'charge',
        v_credit_amount,
        v_new_balance + v_credit_amount,
        p_order_id,
        COALESCE(p_staff_user_id, v_order.customer_id)
      );

      v_new_balance := v_new_balance + v_credit_amount;
    END;
  END IF;

  -- Update the order
  UPDATE orders
  SET
    payment_method = p_payment_method,
    cash_received = p_cash_received,
    fonepay_amount = p_fonepay_amount,
    credit_account_id = p_credit_account_id,
    receipt_number = v_receipt,
    paid_at = now(),
    payment_status = 'paid',
    status = 'completed',
    processed_by = COALESCE(p_staff_user_id, customer_id),
    updated_at = now()
  WHERE id = p_order_id;

  -- Build result
  v_result := jsonb_build_object(
    'receipt_number', v_receipt,
    'order_id', p_order_id,
    'payment_method', p_payment_method,
    'total', v_order.total_amount,
    'cash_received', p_cash_received,
    'fonepay_amount', p_fonepay_amount,
    'change', CASE WHEN p_payment_method = 'cash' THEN p_cash_received - v_order.total_amount ELSE 0 END,
    'credit_new_balance', CASE WHEN p_credit_account_id IS NOT NULL THEN v_new_balance ELSE NULL END
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 9. Open shift RPC ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.open_shift(
  p_merchant_id uuid,
  p_staff_user_id uuid,
  p_opening_cash numeric,
  p_notes text DEFAULT ''
) RETURNS uuid AS $$
DECLARE
  v_shift_id uuid;
BEGIN
  -- Check for existing open shift
  IF EXISTS (
    SELECT 1 FROM cash_shifts
    WHERE merchant_id = p_merchant_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'A shift is already open';
  END IF;

  INSERT INTO cash_shifts (merchant_id, opened_by, opening_cash, notes)
  VALUES (p_merchant_id, p_staff_user_id, p_opening_cash, p_notes)
  RETURNING id INTO v_shift_id;

  RETURN v_shift_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 10. Close shift RPC ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.close_shift(
  p_shift_id uuid,
  p_actual_cash numeric,
  p_closed_by uuid,
  p_notes text DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_shift record;
BEGIN
  SELECT * INTO v_shift
  FROM cash_shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF v_shift IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  IF v_shift.status = 'closed' THEN
    RAISE EXCEPTION 'This shift was already closed';
  END IF;

  UPDATE cash_shifts
  SET
    status = 'closed',
    closed_by = p_closed_by,
    closing_cash_actual = p_actual_cash,
    cash_difference = p_actual_cash - (
      v_shift.opening_cash
      + COALESCE((SELECT SUM(amount) FROM cash_drops WHERE shift_id = p_shift_id AND direction = 'drop'), 0)
      - COALESCE((SELECT SUM(amount) FROM cash_drops WHERE shift_id = p_shift_id AND direction = 'payout'), 0)
      + COALESCE((
        SELECT SUM(cash_received) FROM orders
        WHERE merchant_id = v_shift.merchant_id
          AND payment_method = 'cash'
          AND payment_status = 'paid'
          AND paid_at >= v_shift.opened_at
      ), 0)
    ),
    closed_at = now(),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_shift_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 11. Get shift summary RPC ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_shift_summary(p_shift_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_shift record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_shift FROM cash_shifts WHERE id = p_shift_id;

  IF v_shift IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  SELECT jsonb_build_object(
    'opening_cash', v_shift.opening_cash,
    'cash_sales', COALESCE((
      SELECT SUM(total_amount) FROM orders
      WHERE merchant_id = v_shift.merchant_id
        AND payment_method = 'cash'
        AND payment_status = 'paid'
        AND paid_at >= v_shift.opened_at
        AND (v_shift.closed_at IS NULL OR paid_at <= v_shift.closed_at)
    ), 0),
    'fonepay_sales', COALESCE((
      SELECT SUM(total_amount) FROM orders
      WHERE merchant_id = v_shift.merchant_id
        AND payment_method = 'fonepay'
        AND payment_status = 'paid'
        AND paid_at >= v_shift.opened_at
        AND (v_shift.closed_at IS NULL OR paid_at <= v_shift.closed_at)
    ), 0),
    'credit_charges', COALESCE((
      SELECT SUM(total_amount) FROM orders
      WHERE merchant_id = v_shift.merchant_id
        AND payment_method = 'credit'
        AND payment_status = 'paid'
        AND paid_at >= v_shift.opened_at
        AND (v_shift.closed_at IS NULL OR paid_at <= v_shift.closed_at)
    ), 0),
    'split_sales', COALESCE((
      SELECT SUM(total_amount) FROM orders
      WHERE merchant_id = v_shift.merchant_id
        AND payment_method = 'split'
        AND payment_status = 'paid'
        AND paid_at >= v_shift.opened_at
        AND (v_shift.closed_at IS NULL OR paid_at <= v_shift.closed_at)
    ), 0),
    'cash_drops', COALESCE((
      SELECT SUM(amount) FROM cash_drops
      WHERE shift_id = p_shift_id AND direction = 'drop'
    ), 0),
    'cash_payouts', COALESCE((
      SELECT SUM(amount) FROM cash_drops
      WHERE shift_id = p_shift_id AND direction = 'payout'
    ), 0),
    'total_orders', (
      SELECT COUNT(*) FROM orders
      WHERE merchant_id = v_shift.merchant_id
        AND payment_status = 'paid'
        AND paid_at >= v_shift.opened_at
        AND (v_shift.closed_at IS NULL OR paid_at <= v_shift.closed_at)
    ),
    'walk_in_orders', (
      SELECT COUNT(*) FROM orders
      WHERE merchant_id = v_shift.merchant_id
        AND is_walk_in = true
        AND payment_status = 'paid'
        AND paid_at >= v_shift.opened_at
        AND (v_shift.closed_at IS NULL OR paid_at <= v_shift.closed_at)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 12. Create staff account RPC ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_staff_account(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text DEFAULT 'cashier',
  p_merchant_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_merchant_id uuid;
  v_user_id uuid;
  v_staff_row jsonb;
BEGIN
  v_merchant_id := COALESCE(
    p_merchant_id,
    (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
  );

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'No merchant profile found for current user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM merchant_profiles WHERE id = v_merchant_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the merchant owner can create staff accounts';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, crypt(p_password, gen_salt('bf')),
    now(), now(), now(), '', '',
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_full_name, 'role', 'staff')
  )
  RETURNING id INTO v_user_id;

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id, v_user_id,
    jsonb_build_object('sub', v_user_id, 'email', p_email),
    'email', v_user_id,
    now(), now(), now()
  );

  INSERT INTO public.staff_accounts (user_id, merchant_id, full_name, role, is_active)
  VALUES (v_user_id, v_merchant_id, p_full_name, p_role, true);

  SELECT jsonb_build_object(
    'id', sa.id, 'user_id', sa.user_id, 'merchant_id', sa.merchant_id,
    'full_name', sa.full_name, 'role', sa.role,
    'is_active', sa.is_active, 'created_at', sa.created_at
  ) INTO v_staff_row
  FROM staff_accounts sa WHERE sa.user_id = v_user_id;

  RETURN v_staff_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
