import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tmdbVerify } from "@/lib/telegram/tmdb.server";
import { buildSearchText, generateAliases } from "@/lib/telegram/search.server";

export const Route = createFileRoute("/api/public/hooks/tmdb-backfill")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Math.min(50, Number(url.searchParams.get("limit") || "20"));
        const { data: rows } = await supabaseAdmin
          .from("movies")
          .select("*")
          .or("tmdb_verified.is.null,tmdb_verified.eq.false")
          .order("id", { ascending: true })
          .limit(limit);
        let ok = 0, skipped = 0;
        for (const m of rows ?? []) {
          const v = await tmdbVerify(m.title, m.year).catch(() => null);
          if (!v) { skipped++; continue; }
          const aliases = generateAliases(v.title, v.original_title);
          const search_text = buildSearchText({
            title: v.title, original_title: v.original_title,
            overview: v.overview, genres: v.genres, aliases,
          } as any);
          await supabaseAdmin.from("movies").update({
            title: v.title, year: v.year ?? m.year, language: m.language || v.language,
            tmdb_id: v.tmdb_id, imdb_id: v.imdb_id, original_title: v.original_title,
            poster_url: v.poster_url, backdrop_url: v.backdrop_url, overview: v.overview,
            genres: v.genres, runtime: v.runtime, media_type: v.media_type,
            aliases, search_text, tmdb_verified: true,
          }).eq("id", m.id);
          ok++;
        }
        return new Response(JSON.stringify({ processed: rows?.length ?? 0, ok, skipped }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});