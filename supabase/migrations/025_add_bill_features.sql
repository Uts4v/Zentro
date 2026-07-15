-- 025_add_bill_features.sql
-- Add update_order_discount RPC for editing discounts before payment

CREATE OR REPLACE FUNCTION public.update_order_discount(
  p_order_id uuid,
  p_discount_type text DEFAULT NULL,
  p_discount_value numeric DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_subtotal numeric;
  v_discount_amount numeric := 0;
  v_new_total numeric;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Cannot modify a paid order';
  END IF;

  -- Calculate subtotal from order_items
  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM order_items WHERE order_id = p_order_id;

  -- Calculate discount
  IF p_discount_type IS NOT NULL AND p_discount_value IS NOT NULL AND p_discount_value > 0 THEN
    IF p_discount_type = 'amount' THEN
      v_discount_amount := LEAST(p_discount_value, v_subtotal);
    ELSIF p_discount_type = 'percent' THEN
      v_discount_amount := ROUND(v_subtotal * LEAST(p_discount_value, 100) / 100);
    END IF;
  END IF;

  v_new_total := v_subtotal - v_discount_amount;

  UPDATE orders
  SET
    discount_type = CASE WHEN v_discount_amount > 0 THEN p_discount_type ELSE NULL END,
    discount_value = CASE WHEN v_discount_amount > 0 THEN p_discount_value ELSE NULL END,
    discount_amount = CASE WHEN v_discount_amount > 0 THEN v_discount_amount ELSE NULL END,
    total_amount = v_new_total,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'subtotal', v_subtotal,
    'discount_amount', v_discount_amount,
    'total', v_new_total,
    'discount_type', CASE WHEN v_discount_amount > 0 THEN p_discount_type ELSE NULL END,
    'discount_value', CASE WHEN v_discount_amount > 0 THEN p_discount_value ELSE NULL END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
