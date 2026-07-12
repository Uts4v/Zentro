-- Migration 011: Ensure advance_mission_progress awards mission reward points
-- This fixes the case where the RPC may not exist or wasn't applied.

DROP FUNCTION IF EXISTS public.advance_mission_progress(UUID, UUID, NUMERIC);

CREATE OR REPLACE FUNCTION public.advance_mission_progress(
  p_customer_id UUID,
  p_merchant_id UUID,
  p_order_total NUMERIC DEFAULT 0
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission RECORD;
  v_progress RECORD;
  v_new_count NUMERIC;
  v_should_award boolean;
  v_result text := '';
  v_awarded_total integer := 0;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN 'ERROR: customer_id is null';
  END IF;

  FOR v_mission IN
    SELECT id, target_count, reward_points, mission_type, title
    FROM missions
    WHERE merchant_id = p_merchant_id
      AND is_active = true
  LOOP
    v_should_award := false;

    SELECT id, current_count, is_completed
    INTO v_progress
    FROM customer_missions
    WHERE customer_id = p_customer_id
      AND mission_id = v_mission.id;

    IF v_mission.mission_type = 'spend_amount' THEN
      v_new_count := COALESCE(v_progress.current_count, 0) + p_order_total;
    ELSE
      v_new_count := COALESCE(v_progress.current_count, 0) + 1;
    END IF;

    IF v_progress IS NULL THEN
      INSERT INTO customer_missions (customer_id, mission_id, current_count, is_completed)
      VALUES (p_customer_id, v_mission.id, v_new_count, v_new_count >= v_mission.target_count);
      v_result := v_result || format('Created "%s": %s/%s', v_mission.title, v_new_count, v_mission.target_count);
      IF v_new_count >= v_mission.target_count THEN
        v_should_award := true;
      END IF;
    ELSIF NOT v_progress.is_completed THEN
      UPDATE customer_missions
      SET current_count = v_new_count,
          is_completed = v_new_count >= v_mission.target_count
      WHERE id = v_progress.id;
      v_result := v_result || format('Updated "%s": %s/%s', v_mission.title, v_new_count, v_mission.target_count);
      IF v_new_count >= v_mission.target_count THEN
        v_should_award := true;
      END IF;
    ELSE
      v_result := v_result || format('"%s" already completed', v_mission.title);
    END IF;

    IF v_should_award THEN
      UPDATE profiles
      SET points = points + v_mission.reward_points
      WHERE id = p_customer_id;
      v_awarded_total := v_awarded_total + v_mission.reward_points;
      v_result := v_result || format(' -> AWARDED %s pts', v_mission.reward_points);
    END IF;

    v_result := v_result || E'\n';
  END LOOP;

  IF v_result = '' THEN
    v_result := 'No active missions for this merchant.';
  END IF;

  IF v_awarded_total > 0 THEN
    v_result := v_result || format('TOTAL AWARDED: %s pts', v_awarded_total);
  END IF;

  RETURN v_result;
END;
$$;
