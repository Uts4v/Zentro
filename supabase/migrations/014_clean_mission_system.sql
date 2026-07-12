-- Migration 014: Clean mission system
-- advance_mission_progress: only increments count, no completion logic
-- increment_points: ensure it exists for frontend to award points
-- Frontend myMissions() is the single source of truth for completion + points

-- 1. Ensure increment_points exists
DROP FUNCTION IF EXISTS public.increment_points(UUID, INTEGER);

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

-- 2. Simplify advance_mission_progress: only increment count
DROP FUNCTION IF EXISTS public.advance_mission_progress(UUID, UUID, NUMERIC);

CREATE OR REPLACE FUNCTION public.advance_mission_progress(
  p_customer_id UUID,
  p_merchant_id UUID,
  p_order_total NUMERIC DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission RECORD;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_mission IN
    SELECT id, mission_type
    FROM missions
    WHERE merchant_id = p_merchant_id
      AND is_active = true
  LOOP
    -- Skip spend_amount missions (only RPC can track those)
    IF v_mission.mission_type = 'spend_amount' THEN
      CONTINUE;
    END IF;

    -- Upsert: increment count by 1
    INSERT INTO customer_missions (customer_id, mission_id, current_count, is_completed)
    VALUES (p_customer_id, v_mission.id, 1, false)
    ON CONFLICT (customer_id, mission_id)
    DO UPDATE SET
      current_count = customer_missions.current_count + 1,
      is_completed = false;
  END LOOP;
END;
$$;
