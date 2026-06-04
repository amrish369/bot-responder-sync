-- Admin panel: bot tokens, admin allowlist, activity log
CREATE TABLE public.bot_tokens (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  bot_username TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_tokens TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bot_tokens_id_seq TO service_role;
ALTER TABLE public.bot_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - bot_tokens" ON public.bot_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.admin_allowlist (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_allowlist TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_allowlist_id_seq TO service_role;
ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - admin_allowlist" ON public.admin_allowlist FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.activity_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_email TEXT,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.activity_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.activity_logs_id_seq TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - activity_logs" ON public.activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_bot_tokens_active ON public.bot_tokens(is_active) WHERE is_active = true;