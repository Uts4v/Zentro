-- 035_grant_pos_rpc_permissions.sql
-- Grant EXECUTE on POS RPC functions to authenticated users

-- process_payment (9-param version with credit discount)
GRANT EXECUTE ON FUNCTION public.process_payment(
  uuid, text, numeric, numeric, uuid, uuid, text, numeric, numeric
) TO authenticated;

-- open_shift (5-param version with worker_name)
GRANT EXECUTE ON FUNCTION public.open_shift(uuid, uuid, numeric, text, text) TO authenticated;

-- close_shift
GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric, uuid, text) TO authenticated;

-- get_shift_summary
GRANT EXECUTE ON FUNCTION public.get_shift_summary(uuid) TO authenticated;

-- update_order_discount
GRANT EXECUTE ON FUNCTION public.update_order_discount(uuid, text, numeric) TO authenticated;

-- add_items_to_order
GRANT EXECUTE ON FUNCTION public.add_items_to_order(uuid, jsonb) TO authenticated;

-- verify_shift_worker
GRANT EXECUTE ON FUNCTION public.verify_shift_worker(uuid, text, text) TO authenticated;

-- Loyalty RPCs
GRANT EXECUTE ON FUNCTION public.increment_points(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_mission_progress(uuid, uuid, numeric) TO authenticated;
