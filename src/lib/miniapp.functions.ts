import { createServerFn } from "@tanstack/react-start";

export interface MiniMovie {
  id: number;
  title: string;
  year: number | null;
  language: string | null;
  quality: string | null;
  file_size: number | null;
  poster_url: string | null;
  backdrop_url: string | null;
  overview: string | null;
  genres: string | null;
  runtime: number | null;
  tmdb_id: number | null;
}

const COLS =
  "id,title,year,language,quality,file_size,poster_url,backdrop_url,overview,genres,runtime,tmdb_id";

async function activeBotUsername(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("bot_tokens")
    .select("bot_username")
    .eq("is_active", true)
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  const u = (data as any)?.bot_username as string | undefined;
  return (u || process.env["BOT_USERNAME"] || "cineradarai_bot").replace(/^@/, "");
}

async function fillPosters(movies: MiniMovie[], max = 10) {
  const missing = movies.filter((m) => !m.poster_url).slice(0, max);
  if (!missing.length) return;
  const { enrichPoster } = await import("./public-movies.server");
  await Promise.all(
    missing.map(async (m) => {
      const patch = await enrichPoster(m.id, m.title, m.year);
      if (patch) Object.assign(m, patch);
    }),
  );
}

export const miniAppFeed = createServerFn({ method: "GET" })
  .inputValidator((d: { q?: string; quality?: string; page?: number }) => ({
    q: (d?.q ?? "").toString().slice(0, 80),
    quality: (d?.quality ?? "").toString().slice(0, 10),
    page: Math.max(1, Number(d?.page ?? 1) || 1),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const perPage = 24;
    const from = (data.page - 1) * perPage;

    let query = supabaseAdmin
      .from("movies")
      .select(COLS, { count: "exact" })
      .order("id", { ascending: false })
      .range(from, from + perPage - 1);

    const q = data.q.trim();
    if (q.length >= 2) query = query.ilike("title", `%${q}%`);
    if (data.quality) query = query.ilike("quality", `%${data.quality}%`);

    const { data: rows, count } = await query;
    const movies = ((rows as MiniMovie[]) ?? []);
    await fillPosters(movies);

    let featured: MiniMovie[] = [];
    if (data.page === 1 && !q && !data.quality) {
      const { data: hero } = await supabaseAdmin
        .from("movies")
        .select(COLS)
        .not("backdrop_url", "is", null)
        .order("id", { ascending: false })
        .limit(8);
      featured = ((hero as MiniMovie[]) ?? []);
    }

    return {
      movies,
      featured,
      total: count ?? 0,
      page: data.page,
      perPage,
      botUsername: await activeBotUsername(),
    };
  });

export const miniAppMovie = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => ({ id: Number(d?.id) }))
  .handler(async ({ data }) => {
    if (!Number.isFinite(data.id) || data.id <= 0) {
      return { movie: null, versions: [] as MiniMovie[], botUsername: "" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("movies")
      .select(COLS)
      .eq("id", data.id)
      .maybeSingle();

    const movie = (row as MiniMovie) ?? null;
    if (!movie) return { movie: null, versions: [] as MiniMovie[], botUsername: "" };

    if (!movie.poster_url) {
      const { enrichPoster } = await import("./public-movies.server");
      const patch = await enrichPoster(movie.id, movie.title, movie.year);
      if (patch) Object.assign(movie, patch);
    }

    const { data: siblings } = await supabaseAdmin
      .from("movies")
      .select(COLS)
      .ilike("title", movie.title)
      .neq("id", movie.id)
      .limit(12);

    return {
      movie,
      versions: ((siblings as MiniMovie[]) ?? []),
      botUsername: await activeBotUsername(),
    };
  });
