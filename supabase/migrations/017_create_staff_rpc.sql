-- 017_create_staff_rpc.sql
-- Replaces Edge Function: creates auth user + staff_accounts row via RPC

CREATE OR REPLACE FUNCTION public.create_staff_account(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text DEFAULT 'cashier',
  p_merchant_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_merchant_id uuid;
  v_user_id uuid;
  v_staff_row jsonb;
BEGIN
  v_merchant_id := COALESCE(
    p_merchant_id,
    (SELECT id FROM merchant_profiles WHERE user_id = auth.uid())
  );

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'No merchant profile found for current user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM merchant_profiles WHERE id = v_merchant_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the merchant owner can create staff accounts';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, crypt(p_password, gen_salt('bf')),
    now(), now(), now(), '', '',
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_full_name, 'role', 'staff')
  )
  RETURNING id INTO v_user_id;

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id, v_user_id,
    jsonb_build_object('sub', v_user_id, 'email', p_email),
    'email', v_user_id,
    now(), now(), now()
  );

  INSERT INTO public.staff_accounts (user_id, merchant_id, full_name, role, is_active)
  VALUES (v_user_id, v_merchant_id, p_full_name, p_role, true);

  SELECT jsonb_build_object(
    'id', sa.id, 'user_id', sa.user_id, 'merchant_id', sa.merchant_id,
    'full_name', sa.full_name, 'role', sa.role,
    'is_active', sa.is_active, 'created_at', sa.created_at
  ) INTO v_staff_row
  FROM staff_accounts sa WHERE sa.user_id = v_user_id;

  RETURN v_staff_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
