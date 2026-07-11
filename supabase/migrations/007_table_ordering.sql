-- 007_table_ordering.sql
-- Table ordering feature for merchant dine-in orders

-- ── 1. Add columns to merchant_profiles ──────────────────────────────────────

ALTER TABLE public.merchant_profiles
  ADD COLUMN IF NOT EXISTS table_ordering_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_pickup boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_delivery boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_dine_in boolean DEFAULT false;

-- ── 2. Generate table token function ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_table_token()
RETURNS text AS $$
BEGIN
  RETURN 'TBL-' || upper(substring(encode(gen_random_bytes(8), 'base64') FROM 1 FOR 8));
END;
$$ LANGUAGE plpgsql;

-- ── 3. Merchant tables table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.merchant_tables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id uuid REFERENCES public.merchant_profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  table_number integer NOT NULL,
  public_token text UNIQUE NOT NULL DEFAULT generate_table_token(),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(merchant_id, table_number)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_merchant_tables_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_merchant_tables_updated_at
  BEFORE UPDATE ON public.merchant_tables
  FOR EACH ROW EXECUTE FUNCTION update_merchant_tables_updated_at();

-- ── 4. RLS for merchant_tables ───────────────────────────────────────────────

ALTER TABLE public.merchant_tables ENABLE ROW LEVEL SECURITY;

-- Merchants manage own tables
CREATE POLICY "Merchants manage own tables"
ON public.merchant_tables FOR ALL TO authenticated
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

-- Public can read active tables (for QR resolution)
CREATE POLICY "Public can read active tables"
ON public.merchant_tables FOR SELECT TO anon, authenticated
USING (is_active = true);

-- ── 5. Add columns to orders ─────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'pickup'
    CHECK (order_type IN ('dine_in', 'pickup', 'delivery')),
  ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES public.merchant_tables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS table_name_snapshot text DEFAULT '';

-- ── 6. Create dine-in order RPC ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_dine_in_order(
  p_customer_id uuid,
  p_merchant_id uuid,
  p_table_token text,
  p_items jsonb,
  p_notes text
) RETURNS uuid AS $$
DECLARE
  v_table_id uuid;
  v_table_name text;
  v_order_id uuid;
  v_merchant_table_enabled boolean;
BEGIN
  -- Verify table ordering is enabled
  SELECT table_ordering_enabled INTO v_merchant_table_enabled
  FROM merchant_profiles WHERE id = p_merchant_id;
  IF NOT v_merchant_table_enabled THEN
    RAISE EXCEPTION 'Table ordering is not enabled for this merchant';
  END IF;

  -- Resolve table securely from token + merchant
  SELECT id, name INTO v_table_id, v_table_name
  FROM merchant_tables
  WHERE public_token = p_table_token
    AND merchant_id = p_merchant_id
    AND is_active = true;

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive table';
  END IF;

  -- Create the order
  INSERT INTO orders (
    customer_id, merchant_id, status, order_type,
    table_id, table_name_snapshot, notes, total_amount, points_earned
  )
  VALUES (
    p_customer_id, p_merchant_id, 'pending', 'dine_in',
    v_table_id, v_table_name, p_notes,
    (SELECT COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::integer), 0) FROM jsonb_array_elements(p_items) item),
    (SELECT COALESCE(SUM((item->>'points_per_item')::integer * (item->>'quantity')::integer), 0) FROM jsonb_array_elements(p_items) item)
  )
  RETURNING id INTO v_order_id;

  -- Insert order items
  INSERT INTO order_items (order_id, menu_item_id, name, price, quantity, subtotal)
  SELECT
    v_order_id,
    (item->>'menu_item_id')::uuid,
    item->>'name',
    (item->>'price')::numeric,
    (item->>'quantity')::integer,
    (item->>'price')::numeric * (item->>'quantity')::integer
  FROM jsonb_array_elements(p_items) item;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
