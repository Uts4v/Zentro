-- Migration 008: Create advance_mission_progress RPC
-- Called when an order is confirmed to update mission progress and award reward points

-- First ensure the missions and customer_missions tables exist
-- (they may have been created manually; these are safe no-ops if they already exist)

CREATE TABLE IF NOT EXISTS public.missions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text DEFAULT '',
  icon        text DEFAULT '🎯',
  target_count integer NOT NULL DEFAULT 5,
  reward_points integer NOT NULL DEFAULT 50,
  mission_type text NOT NULL DEFAULT 'order_count' CHECK (mission_type IN ('order_count', 'spend_amount', 'visit_streak')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_missions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id    uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  current_count numeric NOT NULL DEFAULT 0,
  is_completed  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, mission_id)
);

-- Enable RLS
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_missions ENABLE ROW LEVEL SECURITY;

-- Missions: anyone authenticated can read, merchants manage their own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Missions readable by authenticated' AND tablename = 'missions') THEN
    CREATE POLICY "Missions readable by authenticated" ON public.missions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Merchants manage own missions' AND tablename = 'missions') THEN
    CREATE POLICY "Merchants manage own missions" ON public.missions FOR ALL TO authenticated
    USING (merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid()))
    WITH CHECK (merchant_id IN (SELECT id FROM merchant_profiles WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Customer missions: customers read their own, merchants read their customers'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Customers read own missions' AND tablename = 'customer_missions') THEN
    CREATE POLICY "Customers read own missions" ON public.customer_missions FOR SELECT TO authenticated
    USING (customer_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages customer missions' AND tablename = 'customer_missions') THEN
    CREATE POLICY "Service role manages customer missions" ON public.customer_missions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Drop and recreate the function
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
  v_should_award boolean;
BEGIN
  FOR v_mission IN
    SELECT id, target_count, reward_points, mission_type
    FROM missions
    WHERE merchant_id = p_merchant_id
      AND is_active = true
  LOOP
    v_should_award := false;

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
      -- Award points if completed in one shot
      IF v_new_count >= v_mission.target_count THEN
        v_should_award := true;
      END IF;
    ELSIF NOT v_progress.is_completed THEN
      -- Update existing progress
      UPDATE customer_missions
      SET current_count = v_new_count,
          is_completed = v_new_count >= v_mission.target_count
      WHERE id = v_progress.id;
      -- Award points if just crossed the threshold
      IF v_new_count >= v_mission.target_count THEN
        v_should_award := true;
      END IF;
    END IF;

    -- Award reward points
    IF v_should_award THEN
      UPDATE profiles
      SET points = points + v_mission.reward_points
      WHERE id = p_customer_id;
    END IF;
  END LOOP;
END;
$$;
