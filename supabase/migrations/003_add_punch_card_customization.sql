-- Migration: Add punch card customization columns to merchant_profiles
-- Allows merchants to set background theme/image and custom stamp emoji

ALTER TABLE merchant_profiles
  ADD COLUMN IF NOT EXISTS punch_card_bg_color text DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS punch_card_bg_image text,
  ADD COLUMN IF NOT EXISTS punch_card_stamp_emoji text DEFAULT '✓';
