-- 034_add_credit_discount.sql
-- Add credit discount support when customers pay via credit

-- Add credit discount columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS credit_discount_type text CHECK (credit_discount_type IN ('amount', 'percent')),
  ADD COLUMN IF NOT EXISTS credit_discount_value numeric,
  ADD COLUMN IF NOT EXISTS credit_discount_amount numeric;

COMMENT ON COLUMN public.orders.credit_discount_type IS 'Credit payment incentive discount type (amount or percent)';
COMMENT ON COLUMN public.orders.credit_discount_value IS 'Credit discount raw value (NPR or percentage)';
COMMENT ON COLUMN public.orders.credit_discount_amount IS 'Credit discount computed amount in NPR (subtracted from total when charging to credit)';

-- Replace process_payment to accept credit discount params
CREATE OR REPLACE FUNCTION public.process_payment(
  p_order_id uuid,
  p_payment_method text,
  p_cash_received numeric DEFAULT 0,
  p_fonepay_amount numeric DEFAULT 0,
  p_credit_account_id uuid DEFAULT NULL,
  p_staff_user_id uuid DEFAULT NULL,
  p_credit_discount_type text DEFAULT NULL,
  p_credit_discount_value numeric DEFAULT NULL,
  p_credit_discount_amount numeric DEFAULT 0
) RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_receipt text;
  v_new_balance numeric;
  v_credit_discount numeric;
  v_result jsonb;
BEGIN
  -- Lock the order row to prevent concurrent payments
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'This order has already been paid';
  END IF;

  -- Generate receipt number
  v_receipt := generate_receipt_number();

  -- Validate credit discount
  v_credit_discount := GREATEST(COALESCE(p_credit_discount_amount, 0), 0);
  IF v_credit_discount > v_order.total_amount THEN
    v_credit_discount := v_order.total_amount;
  END IF;

  -- Handle credit charge
  IF p_payment_method = 'credit' OR (p_payment_method = 'split' AND p_credit_account_id IS NOT NULL) THEN
    SELECT balance INTO v_new_balance
    FROM credit_accounts
    WHERE id = p_credit_account_id
    FOR UPDATE;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Credit account not found';
    END IF;

    DECLARE v_credit_amount numeric;
    BEGIN
      IF p_payment_method = 'credit' THEN
        v_credit_amount := v_order.total_amount - v_credit_discount;
      ELSE
        v_credit_amount := v_order.total_amount - p_cash_received - p_fonepay_amount - v_credit_discount;
        IF v_credit_amount < 0 THEN v_credit_amount := 0; END IF;
      END IF;

      IF v_new_balance + v_credit_amount > (SELECT credit_limit FROM credit_accounts WHERE id = p_credit_account_id) THEN
        RAISE EXCEPTION 'This charge exceeds the credit limit';
      END IF;

      -- Update credit balance
      UPDATE credit_accounts
      SET balance = balance + v_credit_amount, updated_at = now()
      WHERE id = p_credit_account_id;

      -- Record credit transaction
      INSERT INTO credit_transactions (credit_account_id, merchant_id, type, amount, balance_after, order_id, recorded_by)
      VALUES (
        p_credit_account_id,
        v_order.merchant_id,
        'charge',
        v_credit_amount,
        v_new_balance + v_credit_amount,
        p_order_id,
        COALESCE(p_staff_user_id, v_order.customer_id)
      );

      v_new_balance := v_new_balance + v_credit_amount;
    END;
  END IF;

  -- Update the order
  UPDATE orders
  SET
    payment_method = p_payment_method,
    cash_received = p_cash_received,
    fonepay_amount = p_fonepay_amount,
    credit_account_id = p_credit_account_id,
    receipt_number = v_receipt,
    paid_at = now(),
    payment_status = 'paid',
    status = 'completed',
    processed_by = COALESCE(p_staff_user_id, customer_id),
    updated_at = now(),
    credit_discount_type = CASE WHEN v_credit_discount > 0 THEN p_credit_discount_type ELSE NULL END,
    credit_discount_value = CASE WHEN v_credit_discount > 0 THEN p_credit_discount_value ELSE NULL END,
    credit_discount_amount = CASE WHEN v_credit_discount > 0 THEN v_credit_discount ELSE NULL END
  WHERE id = p_order_id;

  -- Build result
  v_result := jsonb_build_object(
    'receipt_number', v_receipt,
    'order_id', p_order_id,
    'payment_method', p_payment_method,
    'total', v_order.total_amount,
    'cash_received', p_cash_received,
    'fonepay_amount', p_fonepay_amount,
    'change', CASE WHEN p_payment_method = 'cash' THEN p_cash_received - v_order.total_amount ELSE 0 END,
    'credit_new_balance', CASE WHEN p_credit_account_id IS NOT NULL THEN v_new_balance ELSE NULL END,
    'credit_discount_amount', v_credit_discount
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
