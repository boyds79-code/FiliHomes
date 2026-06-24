-- Create trigger to automatically handle vacancy fallback and tenant turnover payer responsibility
CREATE OR REPLACE FUNCTION sync_unit_payer_responsibility()
RETURNS TRIGGER AS $$
DECLARE
    active_tenant_payer_exists BOOLEAN;
    target_unit_id UUID;
BEGIN
    -- Prevent infinite recursion
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    -- Determine unit_id context
    IF TG_OP = 'DELETE' THEN
        target_unit_id := OLD.unit_id;
    ELSE
        target_unit_id := NEW.unit_id;
    END IF;

    -- 1. If an active tenant is designated as the payer, unset all other payers (e.g., owner or other tenants)
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.role = 'tenant' AND NEW.status = 'active' AND NEW.is_payer = true THEN
            UPDATE public.user_units
            SET is_payer = false
            WHERE unit_id = target_unit_id 
              AND id <> NEW.id 
              AND is_payer = true;
            RETURN NEW;
        END IF;
    END IF;

    -- 2. Vacancy Fallback check: Check if there is currently any active tenant set as payer
    SELECT EXISTS (
        SELECT 1 FROM public.user_units
        WHERE unit_id = target_unit_id
          AND role = 'tenant'
          AND status = 'active'
          AND is_payer = true
    ) INTO active_tenant_payer_exists;

    -- If no active tenant is paying, the active owner must pay the bills
    IF NOT active_tenant_payer_exists THEN
        UPDATE public.user_units
        SET is_payer = true
        WHERE unit_id = target_unit_id
          AND role = 'owner'
          AND status = 'active'
          AND is_payer = false;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Bind trigger to user_units
DROP TRIGGER IF EXISTS trigger_sync_unit_payer ON public.user_units;
CREATE TRIGGER trigger_sync_unit_payer
AFTER INSERT OR UPDATE OR DELETE ON public.user_units
FOR EACH ROW
EXECUTE FUNCTION sync_unit_payer_responsibility();
