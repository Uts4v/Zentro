-- 033_add_items_to_order.sql
-- Add items to an existing unpaid order (add-on / additional items)

CREATE OR REPLACE FUNCTION public.add_items_to_order(
  p_order_id uuid,
  p_items jsonb
) RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_item jsonb;
  v_new_subtotal numeric := 0;
  v_total_points integer := 0;
  v_discount_amount numeric := 0;
  v_new_total numeric;
BEGIN
  -- Lock the order row
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Cannot add items to a paid order';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot add items to a completed or cancelled order';
  END IF;

  -- Validate items array is not empty
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items provided';
  END IF;

  -- Insert new order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, menu_item_id, name, price, quantity, subtotal)
    VALUES (
      p_order_id,
      (v_item->>'menu_item_id')::uuid,
      v_item->>'name',
      (v_item->>'price')::numeric,
      (v_item->>'quantity')::integer,
      (v_item->>'price')::numeric * (v_item->>'quantity')::integer
    );

    v_new_subtotal := v_new_subtotal + (v_item->>'price')::numeric * (v_item->>'quantity')::integer;
    v_total_points := v_total_points + COALESCE((v_item->>'points_per_item')::integer, 0) * (v_item->>'quantity')::integer;
  END LOOP;

  -- Recalculate total subtotal (existing + new) from order_items
  SELECT COALESCE(SUM(subtotal), 0) INTO v_new_subtotal
  FROM order_items WHERE order_id = p_order_id;

  -- Re-apply existing discount if any
  IF v_order.discount_type IS NOT NULL AND v_order.discount_value IS NOT NULL AND v_order.discount_value > 0 THEN
    IF v_order.discount_type = 'amount' THEN
      v_discount_amount := LEAST(v_order.discount_value, v_new_subtotal);
    ELSIF v_order.discount_type = 'percent' THEN
      v_discount_amount := ROUND(v_new_subtotal * LEAST(v_order.discount_value, 100) / 100);
    END IF;
  END IF;

  v_new_total := v_new_subtotal - v_discount_amount;

  -- Update order totals
  UPDATE orders
  SET
    total_amount = v_new_total,
    points_earned = points_earned + v_total_points,
    discount_amount = CASE WHEN v_discount_amount > 0 THEN v_discount_amount ELSE NULL END,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'subtotal', v_new_subtotal,
    'discount_amount', v_discount_amount,
    'total', v_new_total,
    'items_added', jsonb_array_length(p_items)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
