import { tmdbVerify } from "@/lib/telegram/tmdb.server";

export interface EnrichPatch {
  poster_url: string | null;
  backdrop_url: string | null;
  overview: string | null;
  genres: string | null;
  runtime: number | null;
  tmdb_id: number | null;
}

/** Fetch poster/metadata from TMDB for a movie missing it, and cache into the DB. */
export async function enrichPoster(
  id: number,
  title: string,
  year: number | null,
): Promise<EnrichPatch | null> {
  try {
    const meta = await tmdbVerify(title, year ?? undefined);
    if (!meta || !meta.poster_url) return null;
    const patch: EnrichPatch = {
      poster_url: meta.poster_url,
      backdrop_url: meta.backdrop_url,
      overview: meta.overview || null,
      genres: meta.genres || null,
      runtime: meta.runtime,
      tmdb_id: meta.tmdb_id,
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("movies").update(patch as any).eq("id", id);
    return patch;
  } catch (e) {
    console.error("[enrichPoster]", id, (e as Error).message);
    return null;
  }
}
