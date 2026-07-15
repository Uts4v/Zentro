-- 020_add_staff_lookup_rpc.sql
-- Public lookup for staff login (bypasses RLS via SECURITY DEFINER)

CREATE OR REPLACE FUNCTION public.find_staff_by_email(p_email text)
RETURNS jsonb AS $$
DECLARE
  v_staff jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', sa.id,
    'user_id', sa.user_id,
    'full_name', sa.full_name,
    'is_active', sa.is_active,
    'merchant_id', sa.merchant_id
  ) INTO v_staff
  FROM staff_accounts sa
  WHERE sa.email = p_email;

  RETURN v_staff;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
