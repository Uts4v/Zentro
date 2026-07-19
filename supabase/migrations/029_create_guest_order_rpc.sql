-- 029_create_guest_order_rpc.sql (v2)
-- Allow unauthenticated (guest) users to place dine-in orders via table QR codes.
-- SECURITY DEFINER bypasses RLS; returns full jsonb so the client doesn't need
-- to query the orders table afterward (anon role has no SELECT on orders).

DROP FUNCTION IF EXISTS public.create_guest_order(uuid, text, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.create_guest_order(
  p_merchant_id uuid,
  p_table_token text,
  p_items jsonb,
  p_notes text DEFAULT '',
  p_guest_name text DEFAULT ''
) RETURNS jsonb AS $$
DECLARE
  v_table_id uuid;
  v_table_name text;
  v_order_id uuid;
  v_total numeric;
  v_store_name text;
  v_items jsonb;
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

  -- Get store name
  SELECT store_name INTO v_store_name
  FROM merchant_profiles WHERE id = p_merchant_id;

  -- Calculate total
  v_total := (SELECT COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::integer), 0) FROM jsonb_array_elements(p_items) item);

  -- Create the order (guest = NULL customer_id, walk_in_name set)
  INSERT INTO orders (
    customer_id, merchant_id, status, order_type,
    table_id, table_name_snapshot, notes, total_amount, points_earned,
    is_walk_in, walk_in_name
  )
  VALUES (
    NULL, p_merchant_id, 'pending', 'dine_in',
    v_table_id, v_table_name, p_notes,
    v_total,
    0,
    true,
    NULLIF(p_guest_name, '')
  )
  RETURNING id INTO v_order_id;

  -- Insert order items and collect as jsonb
  INSERT INTO order_items (order_id, menu_item_id, name, price, quantity, subtotal)
  SELECT
    v_order_id,
    (item->>'menu_item_id')::uuid,
    item->>'name',
    (item->>'price')::numeric,
    (item->>'quantity')::integer,
    (item->>'price')::numeric * (item->>'quantity')::integer
  FROM jsonb_array_elements(p_items) item;

  -- Build order_items jsonb array
  SELECT jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'order_id', oi.order_id,
    'menu_item_id', oi.menu_item_id,
    'name', oi.name,
    'price', oi.price,
    'quantity', oi.quantity,
    'subtotal', oi.subtotal
  )) INTO v_items
  FROM order_items oi WHERE oi.order_id = v_order_id;

  -- Return complete order as jsonb (no client-side fetch needed)
  RETURN jsonb_build_object(
    'id', v_order_id,
    'customer_id', NULL,
    'merchant_id', p_merchant_id,
    'status', 'pending',
    'total_amount', v_total,
    'points_earned', 0,
    'notes', p_notes,
    'order_type', 'dine_in',
    'table_id', v_table_id,
    'table_name_snapshot', v_table_name,
    'is_walk_in', true,
    'walk_in_name', NULLIF(p_guest_name, ''),
    'created_at', now(),
    'updated_at', now(),
    'order_items', COALESCE(v_items, '[]'::jsonb),
    'merchant_profiles', jsonb_build_object('store_name', v_store_name),
    'profiles', NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify the merchant about the new guest order
DROP FUNCTION IF EXISTS public.notify_merchant_guest_order(uuid, uuid);

CREATE OR REPLACE FUNCTION public.notify_merchant_guest_order(
  p_order_id uuid,
  p_merchant_id uuid
) RETURNS void AS $$
DECLARE
  v_merchant record;
  v_guest_name text;
  v_table_name text;
BEGIN
  SELECT user_id INTO v_merchant
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
      format('Guest order at %s - %s', COALESCE(v_table_name, 'Table'), COALESCE(v_guest_name, 'Guest')),
      jsonb_build_object(
        'order_id', p_order_id,
        'merchant_id', p_merchant_id,
        'guest', true
      ),
      false
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Guest order notification skipped: %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow anon role to call these RPCs
GRANT EXECUTE ON FUNCTION public.create_guest_order(uuid, text, jsonb, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.notify_merchant_guest_order(uuid, uuid) TO anon;
