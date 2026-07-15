-- 023_create_shift_workers.sql
-- Simple shift worker system: name + PIN login for POS operators.
-- No Supabase auth — just a simple table validated by RPC.

CREATE TABLE IF NOT EXISTS public.shift_workers (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id uuid REFERENCES public.merchant_profiles(id) ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  pin         text NOT NULL,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(merchant_id, name)
);

ALTER TABLE public.shift_workers ENABLE ROW LEVEL SECURITY;

-- Merchant manages their shift workers
CREATE POLICY "Merchant can manage own shift_workers"
ON public.shift_workers FOR ALL TO authenticated
USING (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
);

CREATE TRIGGER set_shift_workers_updated_at
  BEFORE UPDATE ON public.shift_workers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RPC: verify a shift worker's name + PIN
CREATE OR REPLACE FUNCTION public.verify_shift_worker(
  p_merchant_id uuid,
  p_name text,
  p_pin text
) RETURNS jsonb AS $$
DECLARE
  v_worker record;
BEGIN
  SELECT id, name, is_active INTO v_worker
  FROM shift_workers
  WHERE merchant_id = p_merchant_id
    AND lower(name) = lower(p_name)
    AND pin = p_pin;

  IF v_worker IS NULL THEN
    RAISE EXCEPTION 'Invalid name or PIN';
  END IF;

  IF NOT v_worker.is_active THEN
    RAISE EXCEPTION 'This worker account is disabled';
  END IF;

  RETURN jsonb_build_object(
    'id', v_worker.id,
    'name', v_worker.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add worker_name column to cash_shifts
ALTER TABLE public.cash_shifts
  ADD COLUMN IF NOT EXISTS worker_name text;

-- Update open_shift to accept worker_name
CREATE OR REPLACE FUNCTION public.open_shift(
  p_merchant_id uuid,
  p_staff_user_id uuid,
  p_opening_cash numeric,
  p_notes text DEFAULT '',
  p_worker_name text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_shift_id uuid;
BEGIN
  -- Check for existing open shift
  IF EXISTS (
    SELECT 1 FROM cash_shifts
    WHERE merchant_id = p_merchant_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'A shift is already open. Close it first.';
  END IF;

  INSERT INTO cash_shifts (merchant_id, opened_by, opening_cash, notes, worker_name)
  VALUES (p_merchant_id, p_staff_user_id, p_opening_cash, p_notes, p_worker_name)
  RETURNING id INTO v_shift_id;

  RETURN v_shift_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
