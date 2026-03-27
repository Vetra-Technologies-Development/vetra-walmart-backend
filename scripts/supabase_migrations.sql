-- Supabase migration SQL (apply via Supabase SQL editor or psql)

ALTER TABLE IF EXISTS public.load_assignments
  ADD COLUMN IF NOT EXISTS origin_lat DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS origin_lng DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS destination_lat DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS destination_lng DECIMAL(11, 8);

-- Add indexes for coordinate-based queries
CREATE INDEX IF NOT EXISTS idx_load_assignments_origin_coords ON public.load_assignments (origin_lat, origin_lng) WHERE origin_lat IS NOT NULL AND origin_lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_load_assignments_dest_coords ON public.load_assignments (destination_lat, destination_lng) WHERE destination_lat IS NOT NULL AND destination_lng IS NOT NULL;

-- Inspect columns in loadboard_loads (manual check)
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'loadboard_loads' ORDER BY ordinal_position;

ALTER TABLE loadboard_loads
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS rpm DOUBLE PRECISION;

-- Add many legacy/local time columns (if needed)
ALTER TABLE loadboard_loads
  ADD COLUMN IF NOT EXISTS origin_pickup_date_local TEXT,
  ADD COLUMN IF NOT EXISTS origin_pickup_time_local TEXT,
  ADD COLUMN IF NOT EXISTS origin_pickup_iso_local TEXT,
  ADD COLUMN IF NOT EXISTS origin_pickup_date_local_end TEXT,
  ADD COLUMN IF NOT EXISTS origin_pickup_time_local_end TEXT,
  ADD COLUMN IF NOT EXISTS origin_pickup_iso_local_end TEXT,
  ADD COLUMN IF NOT EXISTS origin_pickup_date_pst TEXT,
  ADD COLUMN IF NOT EXISTS origin_pickup_time_pst TEXT,
  ADD COLUMN IF NOT EXISTS origin_pickup_iso_pst TEXT,
  ADD COLUMN IF NOT EXISTS origin_pickup_date_pst_end TEXT,
  ADD COLUMN IF NOT EXISTS origin_pickup_time_pst_end TEXT,
  ADD COLUMN IF NOT EXISTS origin_pickup_iso_pst_end TEXT,

  ADD COLUMN IF NOT EXISTS destination_delivery_date_local TEXT,
  ADD COLUMN IF NOT EXISTS destination_delivery_time_local TEXT,
  ADD COLUMN IF NOT EXISTS destination_delivery_iso_local TEXT,
  ADD COLUMN IF NOT EXISTS destination_delivery_date_local_end TEXT,
  ADD COLUMN IF NOT EXISTS destination_delivery_time_local_end TEXT,
  ADD COLUMN IF NOT EXISTS destination_delivery_iso_local_end TEXT,
  ADD COLUMN IF NOT EXISTS destination_delivery_date_pst TEXT,
  ADD COLUMN IF NOT EXISTS destination_delivery_time_pst TEXT,
  ADD COLUMN IF NOT EXISTS destination_delivery_iso_pst TEXT,
  ADD COLUMN IF NOT EXISTS destination_delivery_date_pst_end TEXT,
  ADD COLUMN IF NOT EXISTS destination_delivery_time_pst_end TEXT,
  ADD COLUMN IF NOT EXISTS destination_delivery_iso_pst_end TEXT;

ALTER TABLE loadboard_loads
  ADD COLUMN IF NOT EXISTS load_id TEXT;

-- Clean up older text columns in favor of timestamptz fields
ALTER TABLE loadboard_loads
  DROP COLUMN IF EXISTS origin_pickup_date_local,
  DROP COLUMN IF EXISTS origin_pickup_time_local,
  DROP COLUMN IF EXISTS origin_pickup_iso_local,
  DROP COLUMN IF EXISTS origin_pickup_date_local_end,
  DROP COLUMN IF EXISTS origin_pickup_time_local_end,
  DROP COLUMN IF EXISTS origin_pickup_iso_local_end,
  DROP COLUMN IF EXISTS origin_pickup_date_pst,
  DROP COLUMN IF EXISTS origin_pickup_time_pst,
  DROP COLUMN IF EXISTS origin_pickup_iso_pst,
  DROP COLUMN IF EXISTS origin_pickup_date_pst_end,
  DROP COLUMN IF EXISTS origin_pickup_time_pst_end,
  DROP COLUMN IF EXISTS origin_pickup_iso_pst_end,
  DROP COLUMN IF EXISTS destination_delivery_date_local,
  DROP COLUMN IF EXISTS destination_delivery_time_local,
  DROP COLUMN IF EXISTS destination_delivery_iso_local,
  DROP COLUMN IF EXISTS destination_delivery_date_local_end,
  DROP COLUMN IF EXISTS destination_delivery_time_local_end,
  DROP COLUMN IF EXISTS destination_delivery_iso_local_end,
  DROP COLUMN IF EXISTS destination_delivery_date_pst,
  DROP COLUMN IF EXISTS destination_delivery_time_pst,
  DROP COLUMN IF EXISTS destination_delivery_iso_pst,
  DROP COLUMN IF EXISTS destination_delivery_date_pst_end,
  DROP COLUMN IF EXISTS destination_delivery_time_pst_end,
  DROP COLUMN IF EXISTS destination_delivery_iso_pst_end;

-- Add unified timestamptz columns
ALTER TABLE loadboard_loads
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS rpm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS load_id TEXT,

  ADD COLUMN IF NOT EXISTS origin_pickup_local TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origin_pickup_local_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origin_pickup_pst TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origin_pickup_pst_end TIMESTAMPTZ,

  ADD COLUMN IF NOT EXISTS destination_delivery_local TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS destination_delivery_local_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS destination_delivery_pst TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS destination_delivery_pst_end TIMESTAMPTZ;

-- Final check table
-- SELECT * FROM public.loadboard_loads LIMIT 10;
