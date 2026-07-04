
CREATE OR REPLACE FUNCTION public.cleanup_old_cached_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.activity_logs      WHERE created_at < now() - interval '3 days';
  DELETE FROM public.broadcast_logs     WHERE created_at < now() - interval '3 days';
  DELETE FROM public.chat_logs          WHERE created_at < now() - interval '3 days';
  DELETE FROM public.daily_sent_movies  WHERE sent_on   < (current_date - 3);
  DELETE FROM public.payload_store      WHERE expires_at < now() - interval '3 days'
                                           OR expires_at < now();
  DELETE FROM public.requests           WHERE status = 'fulfilled'
                                          AND COALESCE(fulfilled_at, created_at) < now() - interval '3 days';
  DELETE FROM public.requests           WHERE status <> 'fulfilled'
                                          AND created_at < now() - interval '30 days';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-cached-data-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-old-cached-data-daily',
  '17 3 * * *',
  $$ SELECT public.cleanup_old_cached_data(); $$
);
