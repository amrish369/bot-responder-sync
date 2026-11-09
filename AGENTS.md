# Architecture rules

- Provide browser backend configuration through public-only Vite definitions, preferring environment values over checked-in public fallbacks; this keeps published auth working when sandbox environment files are absent without modifying managed clients or exposing private credentials.- Bot text search fetches candidates via the indexed search_movie_candidates RPC with a short in-memory query cache (falls back to full load if RPC missing); never load the full movies table per search — it must scale to 1M+ rows on a 128MB Worker.
