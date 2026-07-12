-- Migration 012: Create redemptions table + confirm_punch_claim RPC
-- Both are referenced in the frontend code but were never created via migration.

-- ── 1. Redemptions table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_id     uuid NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  points_spent  integer NOT NULL DEFAULT 0,
  code          text NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired')),
  expires_at    timestamptz NOT NULL,
  confirmed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_redemptions_code ON public.redemptions(code);

ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

-- Customers can read their own redemptions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Customers read own redemptions' AND tablename = 'redemptions') THEN
    CREATE POLICY "Customers read own redemptions" ON public.redemptions
      FOR SELECT TO authenticated
      USING (customer_id = auth.uid());
  END IF;
END $$;

-- Customers can insert their own redemptions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Customers insert own redemptions' AND tablename = 'redemptions') THEN
    CREATE POLICY "Customers insert own redemptions" ON public.redemptions
      FOR INSERT TO authenticated
      WITH CHECK (customer_id = auth.uid());
  END IF;
END $$;

-- Merchants can read redemptions for their own rewards
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Merchants read reward redemptions' AND tablename = 'redemptions') THEN
    CREATE POLICY "Merchants read reward redemptions" ON public.redemptions
      FOR SELECT TO authenticated
      USING (
        reward_id IN (
          SELECT id FROM rewards WHERE merchant_id IN (
            SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- Merchants can update redemptions for their own rewards (to confirm)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Merchants confirm reward redemptions' AND tablename = 'redemptions') THEN
    CREATE POLICY "Merchants confirm reward redemptions" ON public.redemptions
      FOR UPDATE TO authenticated
      USING (
        reward_id IN (
          SELECT id FROM rewards WHERE merchant_id IN (
            SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
          )
        )
      )
      WITH CHECK (
        reward_id IN (
          SELECT id FROM rewards WHERE merchant_id IN (
            SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- ── 2. confirm_punch_claim RPC ───────────────────────────────────────────────
-- Handles punch card reward codes (code = first 6 chars of order UUID without hyphens)
-- Also handles punch_mission_claims if that table exists.

DROP FUNCTION IF EXISTS confirm_punch_claim(text);

CREATE OR REPLACE FUNCTION confirm_punch_claim(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_order RECORD;
  v_customer RECORD;
  v_claim RECORD;
BEGIN
  v_code := upper(trim(p_code));

  -- Strategy 1: Try punch_mission_claims table (if it exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'punch_mission_claims') THEN
    EXECUTE format(
      'SELECT pc.*, pm.title AS mission_title, pm.reward_label, pm.merchant_id
       FROM punch_mission_claims pc
       JOIN punch_missions pm ON pm.id = pc.punch_mission_id
       WHERE pc.claim_code = %L
         AND pc.status = ''pending''',
      v_code
    ) INTO v_claim;

    IF v_claim IS NOT NULL THEN
      SELECT full_name INTO v_customer FROM profiles WHERE id = v_claim.customer_id;
      EXECUTE format(
        'UPDATE punch_mission_claims SET status = ''confirmed'', confirmed_at = now() WHERE id = %L',
        v_claim.id
      );
      INSERT INTO orders (customer_id, merchant_id, status, total_amount, points_earned, notes)
      VALUES (v_claim.customer_id, v_claim.merchant_id, 'completed', 0, 0,
        'Punch mission reward: ' || coalesce(v_claim.mission_title, 'Reward'));
      RETURN jsonb_build_object(
        'customer_id', v_claim.customer_id,
        'customer_name', coalesce(v_customer.full_name, 'Customer'),
        'reward_label', coalesce(v_claim.reward_label, 'Reward'),
        'success', true
      );
    END IF;
  END IF;

  -- Strategy 2: Punch card reward — code is first 6 chars of order UUID (no hyphens)
  -- Match pending punch card reward orders
  SELECT o.id, o.customer_id, o.merchant_id, o.notes
  INTO v_order
  FROM orders o
  WHERE upper(replace(o.id::text, '-', '')) LIKE v_code || '%'
    AND o.status = 'pending'
    AND o.notes = 'Punch card reward claimed'
  LIMIT 1;

  IF v_order IS NOT NULL THEN
    SELECT full_name INTO v_customer FROM profiles WHERE id = v_order.customer_id;

    -- Just validate the code — leave order as "pending" so merchant
    -- can process it through the normal flow (confirm → prepare → ready → completed).
    -- If the order is already confirmed/being processed, that's fine too.

    RETURN jsonb_build_object(
      'customer_id', v_order.customer_id,
      'customer_name', coalesce(v_customer.full_name, 'Customer'),
      'reward_label', 'Punch card reward',
      'success', true
    );
  END IF;

  -- No match found
  RETURN jsonb_build_object('error', 'Invalid or already used code');
END;
$$;
