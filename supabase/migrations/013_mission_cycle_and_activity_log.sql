-- Migration 013: Mission completion cycle + activity log
-- After a mission completes, reset it so the customer can complete it again.
-- Log all mission completions for customer & merchant history.

-- 1. Add completed_at to customer_missions to track last completion time
ALTER TABLE public.customer_missions
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2. Create activity_log table for all customer activity visible to merchant
CREATE TABLE IF NOT EXISTS public.activity_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant_id   uuid NOT NULL REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  title         text NOT NULL,
  description   text DEFAULT '',
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_activity_log_merchant ON public.activity_log(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_customer ON public.activity_log(customer_id, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Merchants read own activity' AND tablename = 'activity_log') THEN
    CREATE POLICY "Merchants read own activity" ON public.activity_log FOR SELECT TO authenticated
      USING (merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Customers read own activity' AND tablename = 'activity_log') THEN
    CREATE POLICY "Customers read own activity" ON public.activity_log FOR SELECT TO authenticated
      USING (customer_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated insert activity' AND tablename = 'activity_log') THEN
    CREATE POLICY "Authenticated insert activity" ON public.activity_log FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- 3. Rewrite advance_mission_progress: on completion, award + reset (cycle)
DROP FUNCTION IF EXISTS public.advance_mission_progress(UUID, UUID, NUMERIC);

CREATE OR REPLACE FUNCTION public.advance_mission_progress(
  p_customer_id UUID,
  p_merchant_id UUID,
  p_order_total NUMERIC DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission RECORD;
  v_progress RECORD;
  v_new_count NUMERIC;
  v_should_award boolean;
  v_completions jsonb := '[]'::jsonb;
  v_result jsonb;
  v_total_awarded integer := 0;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN jsonb_build_object('error', 'customer_id is null');
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
      IF v_new_count >= v_mission.target_count THEN
        v_should_award := true;
      END IF;
    ELSIF NOT v_progress.is_completed THEN
      UPDATE customer_missions
      SET current_count = v_new_count,
          is_completed = v_new_count >= v_mission.target_count
      WHERE id = v_progress.id;
      IF v_new_count >= v_mission.target_count THEN
        v_should_award := true;
      END IF;
    END IF;

    IF v_should_award THEN
      -- Award points
      UPDATE profiles
      SET points = points + v_mission.reward_points
      WHERE id = p_customer_id;
      v_total_awarded := v_total_awarded + v_mission.reward_points;

      -- Log activity
      INSERT INTO activity_log (customer_id, merchant_id, activity_type, title, description, metadata)
      VALUES (
        p_customer_id,
        p_merchant_id,
        'mission_completed',
        v_mission.title,
        format('Completed "%s" and earned %s points', v_mission.title, v_mission.reward_points),
        jsonb_build_object('mission_id', v_mission.id, 'reward_points', v_mission.reward_points)
      );

      -- Send notification to customer
      INSERT INTO notifications (recipient_id, recipient_role, type, title, body, data)
      VALUES (
        p_customer_id,
        'customer',
        'mission_completed',
        'Mission completed! 🎉',
        format('You completed "%s" and earned %s points!', v_mission.title, v_mission.reward_points),
        jsonb_build_object('mission_id', v_mission.id, 'reward_points', v_mission.reward_points)
      );

      -- Reset for next cycle
      UPDATE customer_missions
      SET current_count = 0,
          is_completed = false,
          completed_at = now()
      WHERE id = v_progress.id;

      v_completions := v_completions || jsonb_build_object(
        'mission_id', v_mission.id,
        'title', v_mission.title,
        'reward_points', v_mission.reward_points
      );
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'completions', v_completions,
    'total_awarded', v_total_awarded
  );

  RETURN v_result;
END;
$$;
