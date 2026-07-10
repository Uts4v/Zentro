-- Migration: Create missing RPC functions (increment_points, increment_punch_card,
-- deduct_points, use_free_reward) that were assumed to exist.

-- Drop existing versions first to avoid parameter name conflicts
DROP FUNCTION IF EXISTS public.increment_points(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.increment_punch_card(UUID, UUID);
DROP FUNCTION IF EXISTS public.deduct_points(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.use_free_reward(UUID, UUID);

-- 1. increment_points: Add points to a user's profile
CREATE OR REPLACE FUNCTION public.increment_points(
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
  SET points = points + pts, updated_at = now()
  WHERE id = user_id;
END;
$$;

-- 2. increment_punch_card: Increment punch count for a customer at a merchant
CREATE OR REPLACE FUNCTION public.increment_punch_card(
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

  INSERT INTO punch_cards (customer_id, merchant_id, punch_count, lifetime_punches, punches_to_free)
  VALUES (p_customer_id, p_merchant_id, 1, 1, v_punches_to_free)
  ON CONFLICT (customer_id, merchant_id)
  DO UPDATE SET
    punch_count = punch_cards.punch_count + 1,
    lifetime_punches = punch_cards.lifetime_punches + 1,
    punches_to_free = v_punches_to_free,
    free_reward_available = (punch_cards.punch_count + 1 >= v_punches_to_free),
    updated_at = now();
END;
$$;

-- 3. deduct_points: Deduct points from a user's profile
CREATE OR REPLACE FUNCTION public.deduct_points(
  target_user_id UUID,
  amount INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET points = GREATEST(points - amount, 0), updated_at = now()
  WHERE id = target_user_id;
END;
$$;

-- 4. use_free_reward: Reset a customer's punch card when they claim a free reward
CREATE OR REPLACE FUNCTION public.use_free_reward(
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

  INSERT INTO punch_cards (customer_id, merchant_id, punch_count, lifetime_punches, punches_to_free)
  VALUES (p_customer_id, p_merchant_id, 0, 0, v_punches_to_free)
  ON CONFLICT (customer_id, merchant_id)
  DO UPDATE SET
    punch_count = 0,
    punches_to_free = v_punches_to_free,
    free_reward_available = false,
    updated_at = now();
END;
$$;
