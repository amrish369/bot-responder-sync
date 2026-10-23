import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ADMIN_IDS, BOT_TOKEN } from "./config.server";
import { getIndianMoviesByType } from "./tmdb.server";
import { getSentTmdbIds, markTmdbSent } from "./db.server";

/**
 * Morning-only daily digest (IST). Each TMDB movie is ever sent once globally
 * (daily_sent_movies), so no user receives the same movie twice. If there is
 * nothing fresh, nothing is sent that day. Admins are always excluded.
 */
const STATE_KEY = "digest_state";
const USERS_PER_RUN = 25;
const MORNING_START_HOUR = 7; // IST
const MORNING_END_HOUR = 11; // IST (exclusive)

interface DigestMovie { title: string; year: string; poster: string; caption: string }
interface DigestState { date: string; movies: DigestMovie[]; cursor: number; done: boolean }

function istNow() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

async function activeToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("bot_tokens").select("token,enabled").eq("enabled", true).order("id").limit(1).maybeSingle();
  if (data && (data as any).token) return (data as any).token as string;
  try { return BOT_TOKEN(); } catch { return null; }
}

async function loadState(): Promise<DigestState | null> {
  const { data } = await supabaseAdmin.from("bot_settings" as any).select("value").eq("key", STATE_KEY).maybeSingle();
  return ((data as any)?.value as DigestState) ?? null;
}
async function saveState(s: DigestState) {
  await supabaseAdmin.from("bot_settings").upsert(
    { key: STATE_KEY, value: s as any, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
}

async function pickFreshMovies(date: string): Promise<DigestMovie[]> {
  const sent = await getSentTmdbIds();
  const released = (await getIndianMoviesByType("new", 12)).filter((m) => !sent.has(m._tmdbId)).slice(0, 2);
  const upcoming = (await getIndianMoviesByType("upcoming", 12)).filter((m) => !sent.has(m._tmdbId)).slice(0, 1);
  // Mark immediately so these are never picked again, even if sending fails.
  await markTmdbSent([
    ...released.map((m) => ({ tmdb_id: m._tmdbId, kind: "released" })),
    ...upcoming.map((m) => ({ tmdb_id: m._tmdbId, kind: "upcoming" })),
  ]);
  const build = (m: any, label: string, first: boolean): DigestMovie => ({
    title: m.Title, year: m.Year, poster: m.Poster,
    caption:
      (first ? `🎬 <b>Daily Movie Update — ${date}</b>\n\n` : "") +
      `${label} <b>${esc(m.Title)}</b> (${m.Year})\n` +
      (m._releaseDate ? `📅 ${esc(m._releaseDate)}\n` : "") +
      (m._language && m._language !== "N/A" ? `🌐 ${esc(m._language)}\n` : "") +
      (m.imdbRating !== "N/A" ? `⭐ TMDB: ${m.imdbRating}/10\n` : "") +
      (m.Plot !== "N/A" ? `\n📖 ${esc(String(m.Plot).slice(0, 220))}` : ""),
  });
  const all = [...released.map((m) => [m, "🆕"]), ...upcoming.map((m) => [m, "🔮"])] as [any, string][];
  return all.map(([m, l], i) => build(m, l, i === 0));
}

export async function runMorningDigest(opts: { force?: boolean } = {}) {
  const { date, hour } = istNow();
  if (!opts.force && (hour < MORNING_START_HOUR || hour >= MORNING_END_HOUR)) {
    return { ok: true, skipped: "not_morning", hour };
  }
  let state = await loadState();
  if (!state || state.date !== date) {
    const movies = await pickFreshMovies(date);
    state = { date, movies, cursor: 0, done: movies.length === 0 };
    await saveState(state);
  }
  if (state.done) return { ok: true, done: true, movies: state.movies.length };

  const token = await activeToken();
  if (!token) return { ok: false, error: "no_bot_token" };

  const admins = ADMIN_IDS();
  const { data: banned } = await supabaseAdmin.from("banned").select("telegram_id");
  const bannedSet = new Set((banned ?? []).map((r: any) => Number(r.telegram_id)));

  const { data: users } = await supabaseAdmin
    .from("tg_users").select("telegram_id")
    .gt("telegram_id", state.cursor).order("telegram_id").limit(USERS_PER_RUN);
  const list = (users ?? []).map((u: any) => Number(u.telegram_id));

  let sent = 0;
  for (const uid of list) {
    state.cursor = uid;
    if (admins.has(uid) || bannedSet.has(uid)) continue;
    for (const m of state.movies) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: uid, photo: m.poster, caption: m.caption, parse_mode: "HTML", disable_notification: true }),
      }).catch(() => null);
      if (!res || !res.ok) break; // blocked/failed user: skip remaining movies
      sent++;
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  if (list.length < USERS_PER_RUN) state.done = true;
  await saveState(state);
  return { ok: true, date, processed: list.length, sent, done: state.done };
}
