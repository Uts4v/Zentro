-- 029_create_guest_order_rpc.sql
-- Allow unauthenticated (guest) users to place dine-in orders via table QR codes.
-- This RPC is SECURITY DEFINER so it bypasses RLS and doesn't require auth.

CREATE OR REPLACE FUNCTION public.create_guest_order(
  p_merchant_id uuid,
  p_table_token text,
  p_items jsonb,
  p_notes text DEFAULT '',
  p_guest_name text DEFAULT ''
) RETURNS uuid AS $$
DECLARE
  v_table_id uuid;
  v_table_name text;
  v_order_id uuid;
  v_merchant_table_enabled boolean;
BEGIN
  -- Verify table ordering is enabled
  SELECT table_ordering_enabled INTO v_merchant_table_enabled
  FROM merchant_profiles WHERE id = p_merchant_id;
  IF NOT v_merchant_table_enabled THEN
    RAISE EXCEPTION 'Table ordering is not enabled for this merchant';
  END IF;

  -- Resolve table securely from token + merchant
  SELECT id, name INTO v_table_id, v_table_name
  FROM merchant_tables
  WHERE public_token = p_table_token
    AND merchant_id = p_merchant_id
    AND is_active = true;

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive table';
  END IF;

  -- Create the order (guest = NULL customer_id, walk_in_name set)
  INSERT INTO orders (
    customer_id, merchant_id, status, order_type,
    table_id, table_name_snapshot, notes, total_amount, points_earned,
    is_walk_in, walk_in_name
  )
  VALUES (
    NULL, p_merchant_id, 'pending', 'dine_in',
    v_table_id, v_table_name, p_notes,
    (SELECT COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::integer), 0) FROM jsonb_array_elements(p_items) item),
    0,
    true,
    NULLIF(p_guest_name, '')
  )
  RETURNING id INTO v_order_id;

  -- Insert order items
  INSERT INTO order_items (order_id, menu_item_id, name, price, quantity, subtotal)
  SELECT
    v_order_id,
    (item->>'menu_item_id')::uuid,
    item->>'name',
    (item->>'price')::numeric,
    (item->>'quantity')::integer,
    (item->>'price')::numeric * (item->>'quantity')::integer
  FROM jsonb_array_elements(p_items) item;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify the merchant about the new guest order via a helper function
-- (called from the client after order creation)
CREATE OR REPLACE FUNCTION public.notify_merchant_guest_order(
  p_order_id uuid,
  p_merchant_id uuid
) RETURNS void AS $$
DECLARE
  v_merchant record;
  v_guest_name text;
  v_table_name text;
BEGIN
  SELECT user_id, store_name INTO v_merchant
  FROM merchant_profiles WHERE id = p_merchant_id;

  IF v_merchant IS NULL THEN RETURN; END IF;

  SELECT walk_in_name, table_name_snapshot INTO v_guest_name, v_table_name
  FROM orders WHERE id = p_order_id;

  BEGIN
    INSERT INTO notifications (
      recipient_id, recipient_role, type, title, body, data, is_read
    ) VALUES (
      v_merchant.user_id,
      'merchant',
      'new_order',
      'New Guest Order!',
      format('Guest order at %s — %s', COALESCE(v_table_name, 'Table'), COALESCE(v_guest_name, 'Guest')),
      jsonb_build_object(
        'order_id', p_order_id,
        'merchant_id', p_merchant_id,
        'guest', true
      ),
      false
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Guest order notification skipped: %', SQLERM;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow anon role to call these RPCs (they are SECURITY DEFINER, so safe)
GRANT EXECUTE ON FUNCTION public.create_guest_order(uuid, text, jsonb, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.notify_merchant_guest_order(uuid, uuid) TO anon;
