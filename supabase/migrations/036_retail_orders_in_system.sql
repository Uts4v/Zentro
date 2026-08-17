-- Add 'retail' to the order_type check constraint on orders table

-- Step 1: Drop existing constraint
DO $block$ DECLARE conname text; BEGIN
  SELECT conname INTO conname
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%order_type%';

  IF conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || conname;
  END IF;
END $block$;

-- Step 2: Add new constraint with 'retail'
ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('dine_in', 'pickup', 'delivery', 'retail'));

NOTIFY pgrst, 'reload schema';
