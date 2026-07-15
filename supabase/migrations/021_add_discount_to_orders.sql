-- 021_add_discount_to_orders.sql
-- Add discount support to orders (amount or percentage)

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('amount', 'percent')),
  ADD COLUMN IF NOT EXISTS discount_value numeric,
  ADD COLUMN IF NOT EXISTS discount_amount numeric;

COMMENT ON COLUMN public.orders.discount_type IS 'amount = fixed NPR discount, percent = percentage discount';
COMMENT ON COLUMN public.orders.discount_value IS 'The raw discount value (NPR amount or percentage number)';
COMMENT ON COLUMN public.orders.discount_amount IS 'The actual calculated discount in NPR (used to subtract from subtotal)';
