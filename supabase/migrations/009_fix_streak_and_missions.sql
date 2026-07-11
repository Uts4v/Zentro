-- Migration 009: Fix streak (per-day, not per-order) and mission reward points
-- THIS IS A NEW MIGRATION — old ones (005, 008) won't re-run.

-- ============================================================
-- 1. Fix try_increment_streak: only increment once per 12 hours
-- ============================================================
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
  v_hours_since NUMERIC;
BEGIN
  SELECT streak_min_amount INTO v_min_amount
  FROM loyalty_rules
  WHERE merchant_id = p_merchant_id;

  IF v_min_amount IS NULL THEN
    v_min_amount := 100;
  END IF;

  IF p_order_total < v_min_amount THEN
    RETURN;
  END IF;

  SELECT streak, last_streak_at INTO v_streak, v_last_streak_at
  FROM profiles
  WHERE id = p_customer_id;

  IF v_streak IS NULL THEN
    v_streak := 0;
  END IF;

  IF v_last_streak_at IS NULL THEN
    v_streak := 1;
  ELSE
    v_hours_since := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_last_streak_at)) / 3600;

    IF v_hours_since < 12 THEN
      -- Less than 12h since last streak — same window, do NOT increment
      RETURN;
    ELSIF v_hours_since < 48 THEN
      -- 12h to 48h — next window, increment streak
      v_streak := v_streak + 1;
    ELSE
      -- More than 48h gap — streak broken, restart
      v_streak := 1;
    END IF;
  END IF;

  UPDATE profiles
  SET
    streak = v_streak,
    last_streak_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_customer_id;

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


-- ============================================================
-- 2. Fix advance_mission_progress: return text for debugging
-- ============================================================
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
