-- 018_add_staff_role.sql
-- Allow 'staff' in profiles.role check constraint

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('customer', 'merchant', 'staff'));
