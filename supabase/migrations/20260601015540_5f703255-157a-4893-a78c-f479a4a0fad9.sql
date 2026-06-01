
-- Persistent bot settings (key/value)
CREATE TABLE IF NOT EXISTS public.bot_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_settings TO service_role;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - bot_settings" ON public.bot_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Broadcast report log
CREATE TABLE IF NOT EXISTS public.broadcast_logs (
  id bigserial PRIMARY KEY,
  total int NOT NULL DEFAULT 0,
  success int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  blocked int NOT NULL DEFAULT 0,
  deleted int NOT NULL DEFAULT 0,
  time_ms int NOT NULL DEFAULT 0,
  admin_id bigint,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.broadcast_logs TO service_role;
ALTER TABLE public.broadcast_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - broadcast_logs" ON public.broadcast_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Daily TMDB poster send dedupe (one row per tmdb id ever sent)
CREATE TABLE IF NOT EXISTS public.daily_sent_movies (
  tmdb_id bigint PRIMARY KEY,
  kind text NOT NULL,
  sent_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date
);
GRANT ALL ON public.daily_sent_movies TO service_role;
ALTER TABLE public.daily_sent_movies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - daily_sent_movies" ON public.daily_sent_movies FOR ALL TO service_role USING (true) WITH CHECK (true);
