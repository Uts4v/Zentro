-- Migration: Create advance_mission_progress RPC
-- Called when an order is confirmed to update mission progress and award reward points

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
  v_progress RECORD;
  v_new_count NUMERIC;
BEGIN
  FOR v_mission IN
    SELECT id, target_count, reward_points, mission_type
    FROM missions
    WHERE merchant_id = p_merchant_id
      AND is_active = true
  LOOP
    -- Get existing progress
    SELECT id, current_count, is_completed
    INTO v_progress
    FROM customer_missions
    WHERE customer_id = p_customer_id
      AND mission_id = v_mission.id;

    -- Calculate new count based on mission type
    IF v_mission.mission_type = 'spend_amount' THEN
      v_new_count := COALESCE(v_progress.current_count, 0) + p_order_total;
    ELSE
      -- order_count and visit_streak both count as 1 per qualifying event
      v_new_count := COALESCE(v_progress.current_count, 0) + 1;
    END IF;

    IF v_progress IS NULL THEN
      -- No progress row yet — create one
      INSERT INTO customer_missions (customer_id, mission_id, current_count, is_completed)
      VALUES (
        p_customer_id,
        v_mission.id,
        v_new_count,
        v_new_count >= v_mission.target_count
      );
    ELSE
      -- Update existing progress (only if not already completed)
      IF NOT v_progress.is_completed THEN
        UPDATE customer_missions
        SET current_count = v_new_count,
            is_completed = v_new_count >= v_mission.target_count,
            updated_at = now()
        WHERE id = v_progress.id;
      END IF;
    END IF;

    -- Award reward points if just completed (was not completed before)
    IF v_progress IS NULL OR (NOT v_progress.is_completed AND v_new_count >= v_mission.target_count) THEN
      UPDATE profiles
      SET points = points + v_mission.reward_points,
          updated_at = now()
      WHERE id = p_customer_id;
    END IF;
  END LOOP;
END;
$$;
