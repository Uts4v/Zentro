-- 031_merchant_rooms.sql
-- Rooms feature: group tables into rooms for easier navigation

-- ── 1. Merchant rooms table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.merchant_rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id uuid REFERENCES public.merchant_profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(merchant_id, name)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_merchant_rooms_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_merchant_rooms_updated_at
  BEFORE UPDATE ON public.merchant_rooms
  FOR EACH ROW EXECUTE FUNCTION update_merchant_rooms_updated_at();

-- ── 2. RLS for merchant_rooms ───────────────────────────────────────────────

ALTER TABLE public.merchant_rooms ENABLE ROW LEVEL SECURITY;

-- Merchants manage own rooms
CREATE POLICY "Merchants manage own rooms"
ON public.merchant_rooms FOR ALL TO authenticated
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

-- Public can read active rooms (for potential future use)
CREATE POLICY "Public can read active rooms"
ON public.merchant_rooms FOR SELECT TO anon, authenticated
USING (is_active = true);

-- ── 3. Add room_id to merchant_tables ───────────────────────────────────────

ALTER TABLE public.merchant_tables
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.merchant_rooms(id) ON DELETE SET NULL;
