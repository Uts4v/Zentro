-- 027_fix_order_items_rls_for_pos.sql
-- The order_items table has RLS enabled but no INSERT policy for merchants.
-- POS walk-in orders insert order_items directly, which fails because
-- the existing RLS only allows the customer (via orders.customer_id = auth.uid()).
-- We need policies that let merchants insert/select order_items for their own orders.

DROP POLICY IF EXISTS "Merchants can insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Merchants can read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated users can insert order_items" ON public.order_items;

-- Merchant can INSERT order_items for orders belonging to their store
CREATE POLICY "Merchants can insert order_items"
ON public.order_items FOR INSERT TO authenticated
WITH CHECK (
  order_id IN (
    SELECT id FROM orders
    WHERE merchant_id IN (
      SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
    )
  )
);

-- Merchant can SELECT order_items for orders belonging to their store
CREATE POLICY "Merchants can read order_items"
ON public.order_items FOR SELECT TO authenticated
USING (
  order_id IN (
    SELECT id FROM orders
    WHERE merchant_id IN (
      SELECT id FROM merchant_profiles WHERE user_id = auth.uid()
    )
  )
);

-- Also allow authenticated users to insert order_items for any order they created
-- (covers the customer ordering flow where customer_id = auth.uid())
-- This is a fallback in case the original policy doesn't cover all paths
CREATE POLICY "Authenticated users can insert order_items"
ON public.order_items FOR INSERT TO authenticated
WITH CHECK (
  order_id IN (
    SELECT id FROM orders WHERE customer_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';
