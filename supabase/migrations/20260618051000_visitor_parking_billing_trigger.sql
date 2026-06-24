-- 1. Create function to automatically bill visitor parking to the resident's monthly bill
CREATE OR REPLACE FUNCTION auto_bill_visitor_parking()
RETURNS TRIGGER AS $$
DECLARE
    target_unit_id UUID;
    target_condo_id UUID;
    current_billing_month VARCHAR(7);
    current_period_label VARCHAR(50);
    existing_bill_id BIGINT;
    parking_fee_amount NUMERIC;
BEGIN
    -- Only trigger if the exit_time is set (visitor has exited), parking_fee is greater than 0,
    -- and the visitor parking fee is NOT paid at the gate (is_paid = false, meaning it is billed to the unit)
    IF NEW.exit_time IS NOT NULL AND NEW.parking_fee > 0 AND NEW.is_paid = false THEN
        
        RAISE NOTICE 'Auto-billing triggered for visitor log ID: %, pass_id: %, fee: ₱%', NEW.id, NEW.pass_id, NEW.parking_fee;
        
        -- Guard against null pass_id
        IF NEW.pass_id IS NULL THEN
            RAISE WARNING 'Visitor log ID: % has null pass_id. Cannot trace resident unit for auto-billing.', NEW.id;
            RETURN NEW;
        END IF;

        -- Fetch unit_id and condo_id from the visitor_passes table using pass_id
        SELECT unit_id, condo_id INTO target_unit_id, target_condo_id
        FROM public.visitor_passes
        WHERE id = NEW.pass_id;

        IF target_unit_id IS NOT NULL THEN
            current_billing_month := to_char(NEW.exit_time, 'YYYY-MM');
            current_period_label := to_char(NEW.exit_time, 'Month YYYY');
            parking_fee_amount := NEW.parking_fee;

            -- Check if there is an existing UNPAID billing record for this unit and month
            SELECT id INTO existing_bill_id
            FROM public.billings
            WHERE unit_id = target_unit_id
              AND billing_month = current_billing_month
              AND status = 'UNPAID'
            LIMIT 1;

            IF existing_bill_id IS NOT NULL THEN
                -- Update existing UNPAID bill: add the parking fee to the parking_fee and total_due columns
                UPDATE public.billings
                SET parking_fee = COALESCE(parking_fee, 0) + parking_fee_amount,
                    total_due = COALESCE(total_due, 0) + parking_fee_amount,
                    description = COALESCE(description || E'\n', '') || 'Visitor Parking Fee (Log ID: ' || NEW.id || '): ₱' || parking_fee_amount
                WHERE id = existing_bill_id;
                
                RAISE NOTICE 'Successfully updated existing UNPAID bill (ID: %) for unit_id: % with parking fee: ₱%', existing_bill_id, target_unit_id, parking_fee_amount;
            ELSE
                -- Create a new UNPAID billing record for the month
                INSERT INTO public.billings (
                    unit_id,
                    condo_id,
                    billing_month,
                    billing_period_label,
                    due_date,
                    parking_fee,
                    total_due,
                    status,
                    description
                ) VALUES (
                    target_unit_id,
                    target_condo_id,
                    current_billing_month,
                    current_period_label,
                    (NEW.exit_time + INTERVAL '15 days')::DATE, -- Due 15 days after exit
                    parking_fee_amount,
                    parking_fee_amount,
                    'UNPAID',
                    'Visitor Parking Fee (Log ID: ' || NEW.id || '): ₱' || parking_fee_amount
                );
                
                RAISE NOTICE 'Successfully created new UNPAID bill for unit_id: % with parking fee: ₱%', target_unit_id, parking_fee_amount;
            END IF;
        ELSE
            RAISE WARNING 'No unit_id mapped to pass_id: % (Visitor Log ID: %). Billing generation skipped.', NEW.pass_id, NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Bind the trigger to visitor_logs table
DROP TRIGGER IF EXISTS trigger_auto_bill_visitor_parking ON public.visitor_logs;
CREATE TRIGGER trigger_auto_bill_visitor_parking
AFTER UPDATE OF exit_time, parking_fee, is_paid ON public.visitor_logs
FOR EACH ROW
EXECUTE FUNCTION auto_bill_visitor_parking();
