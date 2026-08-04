ALTER TABLE public.movies ADD COLUMN IF NOT EXISTS auto_indexed boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS movies_file_id_idx ON public.movies (file_id);
CREATE INDEX IF NOT EXISTS movies_storage_msg_idx ON public.movies (storage_chat_id, storage_message_id);

CREATE TABLE IF NOT EXISTS public.group_membership (
  telegram_id bigint PRIMARY KEY,
  main_joined boolean NOT NULL DEFAULT false,
  backup_joined boolean NOT NULL DEFAULT false,
  channel_joined boolean NOT NULL DEFAULT false,
  last_checked timestamp with time zone,
  last_invited timestamp with time zone,
  last_reminded timestamp with time zone,
  reminder_count integer NOT NULL DEFAULT 0,
  blocked boolean NOT NULL DEFAULT false,
  last_error text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.group_membership TO service_role;
ALTER TABLE public.group_membership ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only - group_membership" ON public.group_membership FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS group_membership_pending_idx ON public.group_membership (main_joined, last_reminded);