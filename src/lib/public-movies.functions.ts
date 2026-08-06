import { createServerFn } from "@tanstack/react-start";

export interface PublicMovie {
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
  created_at: string;
}

const COLS =
  "id,title,year,language,quality,file_size,poster_url,backdrop_url,overview,genres,runtime,tmdb_id,created_at";

const SMALL_FILE_LIMIT = 20 * 1024 * 1024; // Telegram Bot API download cap

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

export const getPublicMovie = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => ({ id: Number(d.id) }))
  .handler(async ({ data }) => {
    if (!Number.isFinite(data.id) || data.id <= 0) {
      return { movie: null, others: [] as PublicMovie[], botUsername: "", directDownload: false };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("movies")
      .select(COLS)
      .eq("id", data.id)
      .maybeSingle();

    const movie = (row as PublicMovie) ?? null;
    if (!movie) {
      return { movie: null, others: [] as PublicMovie[], botUsername: "", directDownload: false };
    }

    const { data: siblings } = await supabaseAdmin
      .from("movies")
      .select(COLS)
      .ilike("title", movie.title)
      .neq("id", movie.id)
      .limit(12);

    return {
      movie,
      others: ((siblings as PublicMovie[]) ?? []),
      botUsername: await activeBotUsername(),
      directDownload: !!movie.file_size && movie.file_size <= SMALL_FILE_LIMIT,
    };
  });

export const listPublicMovies = createServerFn({ method: "GET" })
  .inputValidator((d: { q?: string; page?: number }) => ({
    q: (d.q ?? "").toString().slice(0, 80),
    page: Math.max(1, Number(d.page ?? 1) || 1),
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
    if (data.q.trim().length >= 2) {
      query = query.ilike("title", `%${data.q.trim()}%`);
    }
    const { data: rows, count } = await query;
    return {
      movies: ((rows as PublicMovie[]) ?? []),
      total: count ?? 0,
      page: data.page,
      perPage,
      botUsername: await activeBotUsername(),
    };
  });