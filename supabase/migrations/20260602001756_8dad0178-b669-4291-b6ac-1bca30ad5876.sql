ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS storage_chat_id bigint,
  ADD COLUMN IF NOT EXISTS storage_message_id bigint;

CREATE INDEX IF NOT EXISTS movies_storage_msg_idx
  ON public.movies (storage_message_id)
  WHERE storage_message_id IS NOT NULL;

-- Seed default storage channel id into bot_settings if not present.
INSERT INTO public.bot_settings (key, value)
VALUES ('storage_channel_id', to_jsonb(-1004299446417::bigint))
ON CONFLICT (key) DO NOTHING;

-- Default migration progress row.
INSERT INTO public.bot_settings (key, value)
VALUES ('migration_progress', '{"running":false,"last_id":0,"done":0,"failed":0,"total":0,"started_at":null}'::jsonb)
ON CONFLICT (key) DO NOTHING;