-- 030_public_read_merchants.sql
-- Allow anonymous (guest) users to read approved merchant profiles.
-- Required for guest QR table ordering — the publicTableApi.resolve query
-- needs to look up merchants by store_slug without authentication.

-- Public can read approved, open merchants (for table QR resolution + store listing)
CREATE POLICY "Public can read approved merchants"
  ON merchant_profiles
  FOR SELECT
  TO anon
  USING (is_approved = true);
