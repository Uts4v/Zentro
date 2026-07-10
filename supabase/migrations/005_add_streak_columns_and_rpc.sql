-- Migration: Add streak columns to profiles and create try_increment_streak RPC

-- 1. Create auxiliary tables if they don't exist
CREATE TABLE IF NOT EXISTS public.loyalty_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       UUID NOT NULL REFERENCES merchant_profiles(id) ON DELETE CASCADE,
  points_per_npr    INTEGER NOT NULL DEFAULT 1,
  streak_multiplier DECIMAL NOT NULL DEFAULT 1.5,
  welcome_bonus     INTEGER NOT NULL DEFAULT 50,
  birthday_bonus    INTEGER NOT NULL DEFAULT 100,
  streak_min_amount DECIMAL NOT NULL DEFAULT 100,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(merchant_id)
);

CREATE TABLE IF NOT EXISTS public.punch_cards (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_id           UUID NOT NULL REFERENCES merchant_profiles(id) ON DELETE CASCADE,
  punch_count           INTEGER NOT NULL DEFAULT 0,
  lifetime_punches      INTEGER NOT NULL DEFAULT 0,
  punches_to_free       INTEGER NOT NULL DEFAULT 5,
  free_reward_available BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, merchant_id)
);

ALTER TABLE public.punch_cards ENABLE ROW LEVEL SECURITY;

-- Add missing columns to punch_cards in case the table already existed without them
ALTER TABLE public.punch_cards
  ADD COLUMN IF NOT EXISTS punches_to_free INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS free_reward_available BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- RLS policies for punch_cards
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Customers can read own punch cards' AND tablename = 'punch_cards') THEN
    CREATE POLICY "Customers can read own punch cards"
      ON punch_cards FOR SELECT TO authenticated
      USING (auth.uid() = customer_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Merchants can read own store punch cards' AND tablename = 'punch_cards') THEN
    CREATE POLICY "Merchants can read own store punch cards"
      ON punch_cards FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM merchant_profiles WHERE merchant_profiles.id = punch_cards.merchant_id AND merchant_profiles.user_id = auth.uid()));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Merchants can update own store punch cards' AND tablename = 'punch_cards') THEN
    CREATE POLICY "Merchants can update own store punch cards"
      ON punch_cards FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM merchant_profiles WHERE merchant_profiles.id = punch_cards.merchant_id AND merchant_profiles.user_id = auth.uid()));
  END IF;
END
$$;

-- RLS policies for loyalty_rules
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read loyalty rules' AND tablename = 'loyalty_rules') THEN
    CREATE POLICY "Anyone can read loyalty rules"
      ON loyalty_rules FOR SELECT TO authenticated
      USING (true);
  END IF;
END
$$;

-- 2. Add missing columns to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_streak_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS streak_free_earned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_orders INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Create the try_increment_streak RPC function (SECURITY DEFINER to bypass RLS)
DROP FUNCTION IF EXISTS try_increment_streak(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS try_increment_streak(uuid, uuid, double precision);
CREATE OR REPLACE FUNCTION try_increment_streak(
  p_customer_id UUID,
  p_merchant_id UUID,
  p_order_total DECIMAL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_amount DECIMAL;
  v_last_streak_at TIMESTAMPTZ;
  v_streak INTEGER;
  v_punches_to_free INTEGER;
BEGIN
  -- Get the streak minimum amount for this merchant
  SELECT streak_min_amount INTO v_min_amount
  FROM loyalty_rules
  WHERE merchant_id = p_merchant_id;

  IF v_min_amount IS NULL THEN
    v_min_amount := 100;
  END IF;

  -- Skip if order doesn't meet minimum amount
  IF p_order_total < v_min_amount THEN
    RETURN;
  END IF;

  -- Get current streak info
  SELECT streak, last_streak_at INTO v_streak, v_last_streak_at
  FROM profiles
  WHERE id = p_customer_id;

  -- Calculate new streak value
  IF v_last_streak_at IS NULL THEN
    v_streak := 1;
  ELSIF (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_last_streak_at)) / 3600) < 48 THEN
    v_streak := v_streak + 1;
  ELSE
    v_streak := 1;
  END IF;

  -- Update profile with new streak values
  UPDATE profiles
  SET
    streak = v_streak,
    last_streak_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_customer_id;

  -- Check if streak qualifies for free reward based on merchant's punch threshold
  SELECT punches_to_free INTO v_punches_to_free
  FROM merchant_profiles
  WHERE id = p_merchant_id;

  IF v_punches_to_free IS NOT NULL AND v_streak >= v_punches_to_free THEN
    UPDATE profiles
    SET streak_free_earned = true
    WHERE id = p_customer_id;
  END IF;
END;
$$;

-- 4. Also create the other commonly used RPCs for completeness

-- increment_points: adds points to a user's profile
DROP FUNCTION IF EXISTS increment_points(uuid, integer);
DROP FUNCTION IF EXISTS increment_points(uuid, bigint);
CREATE OR REPLACE FUNCTION increment_points(
  user_id UUID,
  pts INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET points = COALESCE(points, 0) + pts,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = user_id;
END;
$$;

-- increment_punch_card: increments the punch count for a customer at a merchant
DROP FUNCTION IF EXISTS increment_punch_card(uuid, uuid);
CREATE OR REPLACE FUNCTION increment_punch_card(
  p_customer_id UUID,
  p_merchant_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_punches_to_free INTEGER;
  v_punch_count INTEGER;
BEGIN
  -- Get punches needed for free reward
  SELECT punches_to_free INTO v_punches_to_free
  FROM merchant_profiles
  WHERE id = p_merchant_id;

  IF v_punches_to_free IS NULL THEN
    v_punches_to_free := 5;
  END IF;

  -- Insert or update the punch card
  INSERT INTO punch_cards (customer_id, merchant_id, punch_count, lifetime_punches, punches_to_free)
  VALUES (p_customer_id, p_merchant_id, 1, 1, v_punches_to_free)
  ON CONFLICT (customer_id, merchant_id)
  DO UPDATE SET
    punch_count = punch_cards.punch_count + 1,
    lifetime_punches = punch_cards.lifetime_punches + 1,
    punches_to_free = v_punches_to_free,
    updated_at = CURRENT_TIMESTAMP;

  -- Check if user has earned a free reward
  SELECT punch_count INTO v_punch_count
  FROM punch_cards
  WHERE customer_id = p_customer_id AND merchant_id = p_merchant_id;

  IF v_punch_count >= v_punches_to_free THEN
    UPDATE punch_cards
    SET free_reward_available = true
    WHERE customer_id = p_customer_id AND merchant_id = p_merchant_id;
  END IF;
END;
$$;

-- use_free_reward: marks a free reward as used and resets the punch card
DROP FUNCTION IF EXISTS use_free_reward(uuid, uuid);
CREATE OR REPLACE FUNCTION use_free_reward(
  p_customer_id UUID,
  p_merchant_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_punches_to_free INTEGER;
BEGIN
  SELECT punches_to_free INTO v_punches_to_free
  FROM merchant_profiles
  WHERE id = p_merchant_id;

  IF v_punches_to_free IS NULL THEN
    v_punches_to_free := 5;
  END IF;

  UPDATE punch_cards
  SET
    punch_count = 0,
    free_reward_available = false,
    lifetime_punches = lifetime_punches,
    updated_at = CURRENT_TIMESTAMP
  WHERE customer_id = p_customer_id AND merchant_id = p_merchant_id;
END;
$$;

-- deduct_points: deducts points from a user's profile
DROP FUNCTION IF EXISTS deduct_points(uuid, integer);
DROP FUNCTION IF EXISTS deduct_points(uuid, bigint);
CREATE OR REPLACE FUNCTION deduct_points(
  user_id UUID,
  pts INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET points = GREATEST(COALESCE(points, 0) - pts, 0),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = user_id;
END;
$$;
