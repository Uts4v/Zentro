-- 024_fix_orders_rls_for_merchant_pos.sql
-- The orders table has RLS policies that only allow customers to insert orders
-- (WHERE customer_id = auth.uid()). POS walk-in orders set customer_id = null
-- and use processed_by = auth.uid() (the merchant). We need to add policies
-- that let merchants insert/update/read orders for their own store.

-- 1. Drop any conflicting existing INSERT policies on orders (if any)
DROP POLICY IF EXISTS "Merchants can insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Merchants can read own orders" ON public.orders;
DROP POLICY IF EXISTS "Merchants can update own orders" ON public.orders;
DROP POLICY IF EXISTS "Merchant POS full access" ON public.orders;

-- 2. Merchant can INSERT orders for their store (POS walk-in / table orders)
CREATE POLICY "Merchants can insert own orders"
ON public.orders FOR INSERT TO authenticated
WITH CHECK (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
);

-- 3. Merchant can SELECT orders for their store
CREATE POLICY "Merchants can read own orders"
ON public.orders FOR SELECT TO authenticated
USING (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
);

-- 4. Merchant can UPDATE orders for their store (advance status, process payment)
CREATE POLICY "Merchants can update own orders"
ON public.orders FOR UPDATE TO authenticated
USING (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  merchant_id IN (
    SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
  )
);
