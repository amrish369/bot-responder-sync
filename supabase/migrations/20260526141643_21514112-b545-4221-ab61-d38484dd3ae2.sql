
-- movies library
CREATE TABLE public.movies (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  file_id TEXT NOT NULL,
  language TEXT,
  quality TEXT,
  year INTEGER,
  type TEXT,
  added_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_movies_title ON public.movies (lower(title));
GRANT ALL ON public.movies TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.movies_id_seq TO service_role;
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - movies" ON public.movies FOR ALL TO service_role USING (true) WITH CHECK (true);

-- requests
CREATE TABLE public.requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  username TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ
);
CREATE INDEX idx_requests_user ON public.requests (user_id);
CREATE INDEX idx_requests_status ON public.requests (status);
GRANT ALL ON public.requests TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.requests_id_seq TO service_role;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - requests" ON public.requests FOR ALL TO service_role USING (true) WITH CHECK (true);

-- users
CREATE TABLE public.tg_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0
);
GRANT ALL ON public.tg_users TO service_role;
ALTER TABLE public.tg_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - tg_users" ON public.tg_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- banned
CREATE TABLE public.banned (
  telegram_id BIGINT PRIMARY KEY,
  reason TEXT,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.banned TO service_role;
ALTER TABLE public.banned ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - banned" ON public.banned FOR ALL TO service_role USING (true) WITH CHECK (true);

-- chat_logs
CREATE TABLE public.chat_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  role TEXT NOT NULL,
  text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_logs_user ON public.chat_logs (user_id, created_at DESC);
GRANT ALL ON public.chat_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.chat_logs_id_seq TO service_role;
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - chat_logs" ON public.chat_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- convos (active admin <-> user bridges)
CREATE TABLE public.convos (
  admin_id BIGINT PRIMARY KEY,
  target_user_id BIGINT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_convos_target ON public.convos (target_user_id);
GRANT ALL ON public.convos TO service_role;
ALTER TABLE public.convos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - convos" ON public.convos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- pending_uploads (multi-step admin upload state)
CREATE TABLE public.pending_uploads (
  admin_id BIGINT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.pending_uploads TO service_role;
ALTER TABLE public.pending_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - pending_uploads" ON public.pending_uploads FOR ALL TO service_role USING (true) WITH CHECK (true);

-- payload_store (short-key store for callback payloads)
CREATE TABLE public.payload_store (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX idx_payload_store_expires ON public.payload_store (expires_at);
GRANT ALL ON public.payload_store TO service_role;
ALTER TABLE public.payload_store ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - payload_store" ON public.payload_store FOR ALL TO service_role USING (true) WITH CHECK (true);
