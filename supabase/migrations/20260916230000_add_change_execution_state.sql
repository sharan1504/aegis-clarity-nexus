-- Persist governed provider execution state on the change record itself.
-- The payload is server-written and is never an authorization source; approval
-- remains a separate, required boundary.
ALTER TABLE public.change_records
  ADD COLUMN IF NOT EXISTS execution jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.change_records.execution IS
  'Server-maintained governed execution state and approved provider action metadata. Never an authorization source.';

CREATE OR REPLACE FUNCTION app_private.prevent_approved_change_action_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
BEGIN
  IF OLD.execution IS DISTINCT FROM NEW.execution
     AND EXISTS (
       SELECT 1 FROM public.change_approvals ca
       WHERE ca.change_record_id = OLD.id
         AND ca.status IN ('approved', 'pending')
     ) THEN
    RAISE EXCEPTION 'The provider action is immutable once the change record has an approval step.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS change_records_execution_immutability ON public.change_records;
CREATE TRIGGER change_records_execution_immutability
BEFORE UPDATE ON public.change_records
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_approved_change_action_mutation();
