ALTER TABLE public.movies
ADD COLUMN IF NOT EXISTS file_kind text NOT NULL DEFAULT 'video';

UPDATE public.movies
SET file_kind = 'video'
WHERE file_kind IS NULL;

ALTER TABLE public.movies
DROP CONSTRAINT IF EXISTS movies_file_kind_check;

ALTER TABLE public.movies
ADD CONSTRAINT movies_file_kind_check
CHECK (file_kind IN ('video', 'document'));

SELECT setval('public.movies_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.movies), 1), true);