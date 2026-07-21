-- 032_add_room_name_snapshot.sql
-- Store room name alongside table name on orders for display purposes

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS room_name_snapshot text DEFAULT '';
