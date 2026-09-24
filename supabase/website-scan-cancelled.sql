-- Allow user-cancelled scans to be recorded distinctly from failures.
-- Additive only: FAILED rows untouched, finalize guard already skips CANCELLED.
DO $$
BEGIN
  ALTER TABLE public.website_scans DROP CONSTRAINT IF EXISTS website_scans_status_check;
  ALTER TABLE public.website_scans ADD CONSTRAINT website_scans_status_check CHECK (
    status IN ('QUEUED','SCANNING','EXTRACTING','ANALYZING','COMPLETED','PARTIAL','FAILED','CANCELLED')
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
