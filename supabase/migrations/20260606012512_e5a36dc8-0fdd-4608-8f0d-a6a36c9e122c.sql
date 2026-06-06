
-- Persistent delete queue (auto-delete works across serverless cold starts)
CREATE TABLE IF NOT EXISTS public.delete_queue (
  id BIGSERIAL PRIMARY KEY,
  bot_id BIGINT NULL,
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  delete_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delete_queue_due ON public.delete_queue (delete_at);
GRANT ALL ON public.delete_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.delete_queue_id_seq TO service_role;
ALTER TABLE public.delete_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only - delete_queue" ON public.delete_queue;
CREATE POLICY "service role only - delete_queue" ON public.delete_queue
  TO service_role USING (true) WITH CHECK (true);

-- pending request store for force-join (resume original action after user joins)
CREATE TABLE IF NOT EXISTS public.pending_join_actions (
  user_id BIGINT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.pending_join_actions TO service_role;
ALTER TABLE public.pending_join_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only - pending_join_actions" ON public.pending_join_actions;
CREATE POLICY "service role only - pending_join_actions" ON public.pending_join_actions
  TO service_role USING (true) WITH CHECK (true);

-- Schedule cron to drain the delete queue every minute
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('run-delete-queue');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'run-delete-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--1b722323-ac1e-469f-895f-b63ab16c46ce.lovable.app/api/public/hooks/run-delete-queue',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
