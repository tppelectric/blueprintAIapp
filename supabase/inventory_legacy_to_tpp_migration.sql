-- Migrate older Blueprint inventory schema → TPP Electric columns.
-- Run once if you already had `checked_out_to`, `user_id`, `quantity_delta`, etc.

-- Assets: rename checkout column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'checked_out_to'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE public.assets RENAME COLUMN checked_out_to TO assigned_to;
  END IF;
END $$;

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(14, 2);
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS qr_code_url TEXT;
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_asset_type_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_asset_type_check
  CHECK (asset_type IN ('tool', 'material', 'equipment'));

-- Locations
ALTER TABLE public.asset_locations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.asset_locations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.asset_locations ADD COLUMN IF NOT EXISTS qr_code_url TEXT;

-- Materials
ALTER TABLE public.materials_inventory ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 4);
ALTER TABLE public.materials_inventory ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE public.materials_inventory ADD COLUMN IF NOT EXISTS qr_code_url TEXT;
ALTER TABLE public.materials_inventory ADD COLUMN IF NOT EXISTS low_stock_alert BOOLEAN NOT NULL DEFAULT true;

-- Transactions: user_id → employee_id, quantity_delta → quantity, add employee_name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_transactions' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_transactions' AND column_name = 'employee_id'
  ) THEN
    ALTER TABLE public.asset_transactions RENAME COLUMN user_id TO employee_id;
  END IF;
END $$;

ALTER TABLE public.asset_transactions ADD COLUMN IF NOT EXISTS employee_name TEXT;
ALTER TABLE public.asset_transactions ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.asset_transactions ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 4);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_transactions' AND column_name = 'quantity_delta'
  ) THEN
    UPDATE public.asset_transactions SET quantity = ABS(quantity_delta) WHERE quantity IS NULL AND quantity_delta IS NOT NULL;
    ALTER TABLE public.asset_transactions DROP COLUMN IF EXISTS quantity_delta;
  END IF;
END $$;

ALTER TABLE public.asset_transactions ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES public.materials_inventory (id) ON DELETE SET NULL;

-- Drop old CHECK on transaction_type if present (types renamed)
ALTER TABLE public.asset_transactions DROP CONSTRAINT IF EXISTS asset_transactions_transaction_type_check;
