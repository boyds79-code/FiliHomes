-- 1. Enable pg_net extension if not enabled (Supabase asynchronous HTTP client)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Create notification function for pg_cron failures (In-app + Email)
CREATE OR REPLACE FUNCTION notify_cron_failure()
RETURNS TRIGGER AS $$
DECLARE
    job_name TEXT;
    admin_user RECORD;
    project_ref TEXT := 'asqgyncyqnbmitkubjwq'; -- Replace with actual Supabase project reference
BEGIN
    -- Trigger fires when a job run details entry is saved as 'failed'
    IF NEW.status = 'failed' THEN
        -- Fetch job name using jobid
        SELECT jobname INTO job_name FROM cron.job WHERE jobid = NEW.jobid;
        
        -- A) 📲 IN-APP NOTIFICATION: Insert alert into notifications table for all Admin users
        FOR admin_user IN (SELECT id, email, expo_push_token FROM public.profiles WHERE role = 'admin') LOOP
            INSERT INTO public.notifications (
                user_id, 
                title, 
                message, 
                type, 
                data,
                expo_push_token
            ) VALUES (
                admin_user.id,
                '🚨 Cron Job Execution Failed',
                'System maintenance job "' || COALESCE(job_name, 'Unknown') || '" failed. Error: ' || COALESCE(NEW.return_message, 'No details.'),
                'SYSTEM',
                jsonb_build_object(
                    'job_id', NEW.jobid,
                    'run_id', NEW.runid,
                    'error', NEW.return_message
                ),
                admin_user.expo_push_token
            );
        END LOOP;

        -- B) ✉️ EMAIL ALERT: Invoke the system-error-email Edge Function asynchronously using pg_net
        PERFORM net.http_post(
            url := 'https://' || project_ref || '.functions.supabase.co/system-error-email',
            headers := '{"Content-Type": "application/json", "x-webhook-secret": "FiliCondoSecretToken123"}'::jsonb,
            body := jsonb_build_object(
                'job_name', job_name,
                'run_id', NEW.runid,
                'error_message', NEW.return_message,
                'end_time', NEW.end_time
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Bind the trigger to cron.job_run_details table
DROP TRIGGER IF EXISTS trigger_cron_job_failure_alert ON cron.job_run_details;
CREATE TRIGGER trigger_cron_job_failure_alert
AFTER INSERT OR UPDATE OF status ON cron.job_run_details
FOR EACH ROW
EXECUTE FUNCTION notify_cron_failure();
