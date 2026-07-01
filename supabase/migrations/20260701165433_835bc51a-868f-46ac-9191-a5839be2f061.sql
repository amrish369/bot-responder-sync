
ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS tmdb_id INTEGER,
  ADD COLUMN IF NOT EXISTS imdb_id TEXT,
  ADD COLUMN IF NOT EXISTS original_title TEXT,
  ADD COLUMN IF NOT EXISTS poster_url TEXT,
  ADD COLUMN IF NOT EXISTS backdrop_url TEXT,
  ADD COLUMN IF NOT EXISTS overview TEXT,
  ADD COLUMN IF NOT EXISTS genres TEXT,
  ADD COLUMN IF NOT EXISTS runtime INTEGER,
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS aliases TEXT[],
  ADD COLUMN IF NOT EXISTS search_text TEXT,
  ADD COLUMN IF NOT EXISTS tmdb_verified BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS movies_tmdb_id_idx ON public.movies (tmdb_id);
CREATE INDEX IF NOT EXISTS movies_search_text_idx ON public.movies USING gin (to_tsvector('simple', coalesce(search_text, '')));
CREATE INDEX IF NOT EXISTS movies_aliases_idx ON public.movies USING gin (aliases);
