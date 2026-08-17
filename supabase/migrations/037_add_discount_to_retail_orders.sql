-- Add discount columns to retail_orders
ALTER TABLE public.retail_orders
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('amount', 'percent')),
  ADD COLUMN IF NOT EXISTS discount_value numeric,
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;

COMMENT ON COLUMN public.retail_orders.discount_type IS 'amount = fixed NPR discount, percent = percentage discount';
COMMENT ON COLUMN public.retail_orders.discount_value IS 'The raw discount value (NPR amount or percentage number)';
COMMENT ON COLUMN public.retail_orders.discount_amount IS 'Calculated discount amount subtracted from subtotal';
