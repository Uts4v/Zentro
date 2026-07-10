-- Migration: Create notifications table with RLS policies
-- This table is used by the real-time toast system and reward claiming flow

CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_role TEXT NOT NULL DEFAULT 'customer' CHECK (recipient_role IN ('customer', 'merchant')),
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  data          JSONB DEFAULT '{}',
  is_read       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: users can read their own notifications
CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = recipient_id);

-- Policy: authenticated users can insert notifications
-- Required for customers to create notifications for merchants (e.g. punch card reward claim)
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Index for fast lookups by recipient
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
