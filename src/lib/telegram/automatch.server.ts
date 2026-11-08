// Bulk TMDB auto-match for unverified files. Only metadata columns are updated;
// file_id / storage message fields are never touched.
import { parseSmart } from "./smart-parse.server";
import { tmdbSearchOptions, tmdbDetailById, tmdbTvDetailById, type TMDBOption } from "./tmdb.server";

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();

/** "Mirzapur S01 Combined 2018 720p Hindi" → { query: "Mirzapur", year: 2018, series: true } */
export function autoMatchQuery(title: string): { query: string; year: number | null; series: boolean } {
  const m = parseSmart(title);
  return { query: m.title, year: m.year, series: m.kind === "series" };
}

/** Confident only when normalized titles are equal (or near-equal) and year agrees when known. */
export function isConfidentMatch(query: string, year: number | null, o: Pick<TMDBOption, "title" | "year">): boolean {
  const a = norm(query), b = norm(o.title);
  if (!a || !b) return false;
  const oy = o.year ? Number(o.year) : null;
  if (year && oy && Math.abs(year - oy) > 1) return false;
  if (a === b) return true;
  const at = a.split(" "), bt = b.split(" ");
  return at.length >= 2 && !!year && !!oy && (b.startsWith(a + " ") || a.startsWith(b + " "))
    && Math.min(at.length, bt.length) / Math.max(at.length, bt.length) >= 0.5;
}

export async function autoMatchBatch(afterId: number, batch: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin.from("movies")
    .select("id,title,year,type")
    .or("tmdb_verified.is.null,tmdb_verified.eq.false")
    .gt("id", afterId).order("id", { ascending: true }).limit(batch);
  if (error) throw new Error(error.message);
  let matched = 0, skipped = 0, lastId = afterId;
  const samples: string[] = [];
  for (const r of rows ?? []) {
    lastId = r.id;
    try {
      const q = autoMatchQuery(r.title);
      const year = q.year ?? r.year ?? null;
      if (q.query.length < 2) { skipped++; continue; }
      const opts = await tmdbSearchOptions(q.query, 10);
      const prefer = q.series || /series|tv/i.test(r.type ?? "") ? "TV" : "Movie";
      const cands = opts.filter((o) => isConfidentMatch(q.query, year, o));
      const pick = cands.find((o) => o.kind === prefer) ?? cands[0];
      if (!pick) { skipped++; continue; }
      const det = pick.kind === "TV" ? await tmdbTvDetailById(pick.tmdbId) : await tmdbDetailById(pick.tmdbId);
      if (!det) { skipped++; continue; }
      const { confidence: _c, release_date: _r, title: _t, ...meta } = det;
      const search_text = [det.title, det.original_title, det.year, r.title].filter(Boolean).join(" ").toLowerCase();
      // Keep file title (it carries season/episode tags); fill missing year only.
      const { error: ue } = await supabaseAdmin.from("movies")
        .update({ ...meta, year: r.year ?? det.year, search_text, tmdb_verified: true }).eq("id", r.id);
      if (ue) { skipped++; continue; }
      matched++;
      if (samples.length < 3) samples.push(`${r.title} → ${det.title}${det.year ? ` (${det.year})` : ""}`);
    } catch { skipped++; }
  }
  const { count } = await supabaseAdmin.from("movies").select("id", { count: "exact", head: true })
    .or("tmdb_verified.is.null,tmdb_verified.eq.false").gt("id", lastId);
  return { processed: rows?.length ?? 0, matched, skipped, lastId, remaining: count ?? 0, samples };
}
