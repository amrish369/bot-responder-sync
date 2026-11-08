/**
 * Smart metadata parser for Telegram movie / web-series files.
 *
 * Handles promotional caption junk, forwarded footer text, uploader handles,
 * URLs, internal "db:<id>" markers and every common season/episode notation:
 *   S01E01 · S01 E01 · S02EP01 · S01E01-E08 · S01 EP 01-08 Combined
 *   S02 01-08 Combined · Season 2 Episode 4 · Complete Season
 */

export type ContentKind = "movie" | "series";

export interface SmartMeta {
  title: string;
  year: number | null;
  language: string | null;
  quality: string | null;
  kind: ContentKind;
  season: number | null;
  episode_start: number | null;
  episode_end: number | null;
  combined: boolean;
}

export const KNOWN_LANGUAGES = [
  "dual audio", "multi audio", "hindi", "english", "tamil", "telugu",
  "malayalam", "kannada", "punjabi", "bengali", "marathi", "gujarati",
  "korean", "japanese", "spanish", "urdu",
];

const QUALITY_TOKENS = ["2160p", "1440p", "1080p", "720p", "540p", "480p", "360p", "4k", "uhd", "hdr", "hdcam", "camrip", "predvd", "hd", "sd"];

const PROMO_LINE =
  /(https?:\/\/|t\.me\/|www\.|@[A-Za-z0-9_]{3,}|\bjoin\b|\bjoin us\b|\bsubscribe\b|\bvisit\b|\bchannel\b|\bfollow\b|\btelegram\b|\bshare\b|\bpowered\s*by\b|\bupload(ed)?\s*by\b|\brequest\b|\bbackup\b|\bmovies?\s*group\b)/i;

const JUNK_TOKENS =
  /\b(bluray|blu-ray|webrip|web-dl|webdl|web|dl|hdrip|hdtv|dvdrip|dvdscr|brrip|bdrip|x264|x265|h264|h265|hevc|avc|10bit|8bit|aac|ac3|dts|ddp5[\s.]?1|dd5[\s.]?1|esub|esubs|msub|msubs|untouched|orig|original|print|hq|nf|amzn|hs|sonyliv|zee5|hotstar|jio|mx|netflix|prime|complete|combined|full|series|season|episode|ep|pahe|psa|yts|rarbg|mkv|mp4|avi|webm|dd|ddp|truehd|atmos|multi|subs?|hin|eng|tam|tel|mal|kan|hdhub4u?|filmy\s*men|filmyzilla|vegamovies|movieflix|migrated|re-archive|skymovieshd|katmovie\w*|9xmovies|bolly4u|worldfree4u|extramovies|tamilrockers|isaimini|cinevood|dvdplay|mkvcinemas)\b/gi;

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{2190}-\u{21FF}\u{2600}-\u{27BF}]/gu;

/** Remove promo lines, links, handles, emojis and internal db ids from raw text. */
export function cleanRawText(raw: string): string {
  if (!raw) return "";
  const lines = String(raw)
    .replace(/\bdb:\s*\d+\b/gi, " ")
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const line of lines) {
    const stripped = line.replace(EMOJI, " ").trim();
    if (!stripped) continue;
    if (PROMO_LINE.test(stripped)) {
      // The first line often mixes the title with a promo handle — keep the
      // part before the promo marker instead of dropping it completely.
      const head = stripped
        .split(/https?:\/\/|t\.me\/|www\.|@[A-Za-z0-9_]{3,}|\bjoin\b|\bvisit\b|\bpowered\s*by\b|\bupload(?:ed)?\s*by\b/i)[0]
        .trim();
      if (kept.length === 0 && head.length >= 3) kept.push(head);
      continue;
    }
    kept.push(stripped);
  }
  return (kept.length ? kept.join(" ") : lines.join(" ").replace(EMOJI, " "))
    .replace(/\s+/g, " ")
    .trim();
}

interface SeriesHit {
  season: number | null;
  ep_start: number | null;
  ep_end: number | null;
  combined: boolean;
  consumed: string[];
}

function detectSeries(text: string): SeriesHit | null {
  const t = text;
  const combinedWord = /\b(combined|complete|full\s*season|all\s*episodes?|batch)\b/i.test(t);

  const patterns: Array<{ re: RegExp; map: (m: RegExpMatchArray) => SeriesHit }> = [
    // S01 E01 04 / S01 EP 01 04 — space-separated episode range (no dash)
    {
      re: /\bS\s*(\d{1,2})\s*[.\-_ ]*\s*(?:E|EP|EPS|EPISODE)\s*(\d{1,3})\s+(\d{1,3})\b/i,
      map: (m) => ({ season: +m[1], ep_start: +m[2], ep_end: +m[3], combined: true, consumed: [m[0]] }),
    },
    // E05 10 / EP 01 04 — episode range without season and without dash
    {
      re: /\b(?:E|EP|EPS|EPISODE)\s*(\d{1,3})\s+(\d{1,3})\b/i,
      map: (m) => ({ season: null, ep_start: +m[1], ep_end: +m[2], combined: true, consumed: [m[0]] }),
    },
    // S01E01-E08 / S01 EP 01 - 08 / S02EP01 / S01 E01
    {
      re: /\bS\s*(\d{1,2})\s*[.\-_ ]*\s*(?:E|EP|EPS|EPISODE)\s*(\d{1,3})\s*(?:[-–—]|\s+to\s+)\s*(?:E|EP|EPISODE)?\s*(\d{1,3})\b/i,
      map: (m) => ({ season: +m[1], ep_start: +m[2], ep_end: +m[3], combined: true, consumed: [m[0]] }),
    },
    {
      re: /\bS\s*(\d{1,2})\s*[.\-_ ]*\s*(?:E|EP|EPS|EPISODE)\s*(\d{1,3})\b/i,
      map: (m) => ({ season: +m[1], ep_start: +m[2], ep_end: +m[2], combined: combinedWord, consumed: [m[0]] }),
    },
    // Season 2 Episode 4 / Season 02 Ep 4-8
    {
      re: /\bSeason\s*(\d{1,2})\s*(?:[-–—:]|\s)*\s*(?:Episode|Ep|E)\s*(\d{1,3})(?:\s*(?:[-–—]|\s+to\s+)\s*(?:Episode|Ep|E)?\s*(\d{1,3}))?\b/i,
      map: (m) => ({
        season: +m[1], ep_start: +m[2], ep_end: m[3] ? +m[3] : +m[2],
        combined: !!m[3] || combinedWord, consumed: [m[0]],
      }),
    },
    // S02 01-08 Combined
    {
      re: /\bS\s*(\d{1,2})\s+(\d{1,3})\s*(?:[-–—]|\s+to\s+)\s*(\d{1,3})\b/i,
      map: (m) => ({ season: +m[1], ep_start: +m[2], ep_end: +m[3], combined: true, consumed: [m[0]] }),
    },
    // Complete Season 2 / Season 2 Complete / S02 Complete
    {
      re: /\b(?:complete\s*)?season\s*(\d{1,2})\b(?:\s*(?:complete|combined))?/i,
      map: (m) => ({ season: +m[1], ep_start: null, ep_end: null, combined: true, consumed: [m[0]] }),
    },
    {
      re: /\bS\s*(\d{1,2})\b(?=\s*(?:complete|combined|\b))/i,
      map: (m) => ({ season: +m[1], ep_start: null, ep_end: null, combined: combinedWord, consumed: [m[0]] }),
    },
  ];

  for (const p of patterns) {
    const m = t.match(p.re);
    if (m) {
      const hit = p.map(m);
      if (hit.season !== null && (hit.season < 0 || hit.season > 60)) continue;
      if (hit.ep_start !== null && hit.ep_end !== null && hit.ep_end < hit.ep_start) continue;
      if (hit.ep_end !== null && hit.ep_start !== null && hit.ep_end - hit.ep_start > 200) continue;
      return hit;
    }
  }
  return null;
}

function detectQuality(text: string): { quality: string | null; consumed: string | null } {
  for (const q of QUALITY_TOKENS) {
    const re = new RegExp(`\\b${q}\\b`, "i");
    const m = text.match(re);
    if (m) {
      const low = q.toLowerCase();
      const quality =
        low === "4k" || low === "uhd" ? "4K" :
        low === "hdr" ? "HDR" :
        low === "hd" ? "HD" : low === "sd" ? "SD" :
        low === "hdcam" ? "HDCAM" : low === "camrip" ? "CAMRip" :
        low === "predvd" ? "PreDVD" : low;
      return { quality, consumed: m[0] };
    }
  }
  return { quality: null, consumed: null };
}

function detectLanguage(text: string): { language: string | null; consumed: string | null } {
  for (const lang of [...KNOWN_LANGUAGES].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${lang}\\b`, "i");
    const m = text.match(re);
    if (m) {
      const language = lang.replace(/\b\w/g, (c) => c.toUpperCase());
      return { language, consumed: m[0] };
    }
  }
  return { language: null, consumed: null };
}

function cleanTitleText(s: string): string {
  return s
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, " ")
    .replace(/\((?!\s*(?:19|20)\d{2}\s*\))[^)]*\)/g, " ")
    .replace(JUNK_TOKENS, " ")
    .replace(/[._]+/g, " ")
    .replace(/[|@#~*+]+/g, " ")
    .replace(/\s*[-–—:,]+\s*$/g, " ")
    .replace(/^\s*[-–—:,]+\s*/g, " ")
    .replace(/\bN\/A\b/gi, " ")
    .replace(/\b(?:\w+(?:movies?hd|moviez|flix|hub|4u|rockers)|(?:movies?hd|moviez|hdhub|filmy)\w*)\b/gi, " ")
    .replace(/\bx\d{1,4}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+[57]\s+1\b/g, " ")
    .replace(/(?:\s+(?:x\d+|[a-z]))+$/i, "")
    .replace(/\s+/g, " ")
    .replace(/[-–—:,|]+$/, "")
    .trim();
}

/** Parse a caption / filename into structured metadata. */
export function parseSmart(raw: string, fileName?: string | null): SmartMeta {
  const source = cleanRawText(raw) || cleanRawText(fileName || "");
  let s = source.replace(/\.(mkv|mp4|avi|webm|mov|m4v)\b/gi, " ");

  const series = detectSeries(s);
  if (series) for (const c of series.consumed) s = s.replace(c, " ");

  const yearM = s.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearM ? Number(yearM[0]) : null;
  if (yearM) s = s.replace(yearM[0], " ");

  const q = detectQuality(s);
  if (q.consumed) s = s.replace(q.consumed, " ");

  const l = detectLanguage(s);
  if (l.consumed) s = s.replace(l.consumed, " ");

  let title = cleanTitleText(s);
  if (title.length < 2 && fileName) {
    title = cleanTitleText(cleanRawText(fileName).replace(/\.(mkv|mp4|avi|webm|mov|m4v)\b/gi, " "));
  }

  return {
    title,
    year,
    language: l.language,
    quality: q.quality,
    kind: series ? "series" : "movie",
    season: series?.season ?? null,
    episode_start: series?.ep_start ?? null,
    episode_end: series?.ep_end ?? null,
    combined: !!series?.combined,
  };
}

export interface CaptionSource {
  title: string;
  year?: number | null;
  language?: string | null;
  quality?: string | null;
  content_kind?: string | null;
  season?: number | null;
  episode_start?: number | null;
  episode_end?: number | null;
  is_combined?: boolean | null;
  file_size?: number | null;
}

function fmtSize(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/** Compact tag for buttons / storage captions, e.g. "S01E01-E04 Combined". */
export function seriesTag(m: CaptionSource): string | null {
  const season = m.season ?? null;
  const epS = m.episode_start ?? null;
  const epE = m.episode_end ?? null;
  if (m.content_kind !== "series" && !season && !epS) return null;
  if (!season && !epS) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const s = season ? `S${pad(season)}` : "";
  if (epS && epE && epE > epS) {
    return `${s}E${pad(epS)}-E${pad(epE)}${m.is_combined ? " Combined" : ""}`.trim();
  }
  if (epS) return `${s}E${pad(epS)}`;
  return `${s}${m.is_combined ? " Combined" : ""}`.trim();
}

/** Human label for the season/episode part, e.g. "Season 1 · Episode 01-08 (Combined)". */
export function episodeLabel(m: CaptionSource): string | null {
  const season = m.season ?? null;
  const epS = m.episode_start ?? null;
  const epE = m.episode_end ?? null;
  if (m.content_kind !== "series" && !season && !epS) return null;
  if (!season && !epS) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const parts: string[] = [];
  if (season) parts.push(`Season ${season}`);
  if (epS && epE && epE > epS) parts.push(`Episode ${pad(epS)}-${pad(epE)}`);
  else if (epS) parts.push(`Episode ${pad(epS)}`);
  else parts.push("Complete");
  let s = parts.join(" · ");
  if (m.is_combined && epS) s += ` (Combined)`;
  return s;
}


/**
 * User-facing caption built purely from cleaned metadata.
 * Never contains db ids, links, handles or promotional text.
 */
export function buildUserCaption(
  m: CaptionSource,
  opts: { escape?: (s: string) => string; footer?: string | null } = {},
): string {
  const esc = opts.escape ?? ((x: string) => x);
  const lines: string[] = [];
  lines.push(`🎬 ${esc(m.title)}${m.year ? ` (${m.year})` : ""}`);
  const ep = episodeLabel(m);
  if (ep) lines.push(`📺 ${esc(ep)}`);
  const bits = [
    m.language ? `🌐 ${esc(m.language)}` : null,
    m.quality ? `🎞️ ${esc(m.quality)}` : null,
    fmtSize(m.file_size) ? `💾 ${fmtSize(m.file_size)}` : null,
  ].filter(Boolean);
  if (bits.length) lines.push(bits.join(" | "));
  if (opts.footer) lines.push("", opts.footer);
  return lines.join("\n");
}
