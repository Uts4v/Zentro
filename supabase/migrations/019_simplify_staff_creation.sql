-- 019_simplify_staff_creation.sql
-- Merchant creates staff row only. Staff sets their own password via sign-up.

-- Add email column
ALTER TABLE public.staff_accounts ADD COLUMN IF NOT EXISTS email text;

-- Populate from existing auth.users
UPDATE public.staff_accounts sa
SET email = au.email
FROM auth.users au
WHERE sa.user_id = au.id AND sa.email IS NULL;

-- Make user_id nullable (staff sets up their own account later)
ALTER TABLE public.staff_accounts ALTER COLUMN user_id DROP NOT NULL;

-- Make email required and unique
ALTER TABLE public.staff_accounts ALTER COLUMN email SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_accounts_email_key') THEN
    ALTER TABLE public.staff_accounts ADD CONSTRAINT staff_accounts_email_key UNIQUE (email);
  END IF;
END $$;

-- Simple RPC: just creates the staff row
CREATE OR REPLACE FUNCTION public.create_staff_account(
  p_email text,
  p_full_name text,
  p_role text DEFAULT 'cashier',
  p_merchant_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_merchant_id uuid;
  v_staff_row jsonb;
BEGIN
  v_merchant_id := COALESCE(p_merchant_id, (SELECT id FROM merchant_profiles WHERE user_id = auth.uid()));
  IF v_merchant_id IS NULL THEN RAISE EXCEPTION 'No merchant profile found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM merchant_profiles WHERE id = v_merchant_id AND user_id = auth.uid()) THEN RAISE EXCEPTION 'Only merchant owner can create staff'; END IF;
  IF EXISTS (SELECT 1 FROM staff_accounts WHERE email = p_email) THEN RAISE EXCEPTION 'A staff account with this email already exists'; END IF;

  INSERT INTO public.staff_accounts (user_id, merchant_id, full_name, role, is_active, email)
  VALUES (NULL, v_merchant_id, p_full_name, p_role, true, p_email);

  SELECT jsonb_build_object('id', sa.id, 'user_id', sa.user_id, 'merchant_id', sa.merchant_id, 'full_name', sa.full_name, 'role', sa.role, 'is_active', sa.is_active, 'email', sa.email, 'created_at', sa.created_at)
  INTO v_staff_row FROM staff_accounts sa WHERE sa.email = p_email;

  RETURN v_staff_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
