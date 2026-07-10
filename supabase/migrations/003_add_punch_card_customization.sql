-- Migration: Add punch card customization columns to merchant_profiles
-- Allows merchants to set background theme/image, custom stamp emoji, and stamp mode

ALTER TABLE merchant_profiles
  ADD COLUMN IF NOT EXISTS punch_card_bg_color text DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS punch_card_bg_image text,
  ADD COLUMN IF NOT EXISTS punch_card_stamp_emoji text DEFAULT '✓',
  ADD COLUMN IF NOT EXISTS punch_card_stamp_mode text DEFAULT 'orders' CHECK (punch_card_stamp_mode IN ('orders', 'streak'));

-- Allow any authenticated user (customers) to read merchant profiles
-- Required so customerApi.getPunchCard() can fetch stamp mode, bg color, etc.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Authenticated users can read merchant profiles'
      AND tablename = 'merchant_profiles'
  ) THEN
    CREATE POLICY "Authenticated users can read merchant profiles"
      ON merchant_profiles
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END
$$;
