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
const JUNK = /\b(bluray|blu-ray|webrip|web-dl|webdl|web|dl|hdrip|hdtv|dvdrip|brrip|x264|x265|h264|h265|hevc|10bit|8bit|aac|ddp?5[\s.]?1|dd5[\s.]?1|esub|esubs|msub|dual\s*audio|hin|eng|tam|tel|mkv|mp4|avi|480p|720p|1080p|2160p|4k|pahe|in|untouched|hq|hdcam|predvd|camrip|s\d{1,2}e\d{1,2})\b/gi;

/** Strip release-group / encoder junk so TMDB can match the real title. */
export function cleanTitle(raw: string): string {
  let t = (raw || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .split(/powered\s*by|⛩|\bdb:\s*\d+/i)[0]
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, " ")
    .replace(/[._]+/g, " ");
  // cut at the first release-junk token — everything after it is encoder noise
  const words = t.split(/\s+/).filter(Boolean);
  const cut: string[] = [];
  for (const w of words) {
    JUNK.lastIndex = 0;
    if (JUNK.test(w) || /^(19|20)\d{2}$/.test(w) || /^[|@#\-–—:,]+$/.test(w)) break;
    cut.push(w);
  }
  const head = cut.join(" ").replace(/[-–—:,|]+$/, "").trim();
  if (head.length >= 2) return head;
  t = t.replace(JUNK, " ").replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/[|@#]+/g, " ").replace(/\s+/g, " ").trim().replace(/[-–—:,]+$/, "").trim();
  return t || (raw || "").trim();
}

export async function enrichPoster(
  id: number,
  title: string,
  year: number | null,
): Promise<EnrichPatch | null> {
  try {
    const cleaned = cleanTitle(title);
    let meta = await tmdbVerify(cleaned, year ?? undefined);
    if ((!meta || !meta.poster_url) && year) meta = await tmdbVerify(cleaned, null);
    if ((!meta || !meta.poster_url) && cleaned !== title) meta = await tmdbVerify(title, year ?? undefined);
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
