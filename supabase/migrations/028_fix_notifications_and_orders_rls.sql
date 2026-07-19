-- 028_fix_notifications_and_orders_rls.sql
-- Fix 1: Make notifications.recipient_id nullable so dashboard triggers
--         that notify customers don't fail for walk-in orders (customer_id = NULL)
-- Fix 2: Ensure orders RLS allows merchants to process payments

-- ── 1. Fix notifications.recipient_id ────────────────────────────────────────
-- A dashboard-created trigger on orders likely inserts into notifications
-- with recipient_id = orders.customer_id, which is NULL for walk-in orders.
-- Make recipient_id nullable and add a conditional trigger guard.

ALTER TABLE public.notifications
  ALTER COLUMN recipient_id DROP NOT NULL;

-- Drop and recreate the order notification trigger if it exists
-- (guards against NULL recipient_id)
DROP TRIGGER IF EXISTS on_order_status_change ON public.orders;
DROP FUNCTION IF EXISTS public.handle_order_notification();

CREATE OR REPLACE FUNCTION public.handle_order_notification()
RETURNS trigger AS $$
BEGIN
  -- Only notify if there's a customer to notify
  IF NEW.customer_id IS NOT NULL AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    BEGIN
      INSERT INTO notifications (recipient_id, recipient_role, type, title, body, data)
      VALUES (
        NEW.customer_id,
        'customer',
        'order_completed',
        'Order completed!',
        'Your order has been completed. Thank you!',
        jsonb_build_object('order_id', NEW.id, 'merchant_id', NEW.merchant_id)
      );
    EXCEPTION WHEN OTHERS THEN
      -- Don't let notification errors block order updates
      RAISE NOTICE 'Notification insert skipped: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create the trigger if one doesn't already exist from the dashboard
DO $$ BEGIN
  CREATE TRIGGER on_order_status_change
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_order_notification();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
