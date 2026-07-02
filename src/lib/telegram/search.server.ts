import Fuse from "fuse.js";
import type { MovieRow } from "./db.server";

// ── Normalization ──────────────────────────────────────────────
const QUALITY_TOKENS =
  /\b(480p|720p|1080p|2160p|4k|hd|hdrip|webrip|web-dl|bluray|brrip|dvdrip|hdcam|camrip|hevc|x264|x265|10bit)\b/gi;
const LANG_TOKENS =
  /\b(hindi|english|tamil|telugu|malayalam|kannada|punjabi|bengali|marathi|dual audio|multi audio|dual|multi)\b/gi;
const YEAR_TOKEN = /\b(19\d{2}|20\d{2})\b/g;
const EMOJI = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

/** Strong normalization for search comparison. */
export function normalizeTitle(input: string): string {
  if (!input) return "";
  let s = input.toLowerCase();
  s = s.replace(EMOJI, " ");
  s = s.replace(QUALITY_TOKENS, " ");
  s = s.replace(LANG_TOKENS, " ");
  s = s.replace(YEAR_TOKEN, " ");
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " "); // strip punctuation
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Lighter normalization — preserves the whole title minus punctuation. */
export function lightNormalize(input: string): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .replace(EMOJI, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Roman-numeral / part-number aliases. */
const ROMAN: Array<[RegExp, string]> = [
  [/\bpart\s*(\d+)\b/gi, "$1"],
  [/\bchapter\s*(\d+)\b/gi, "$1"],
  [/\bii\b/gi, "2"],
  [/\biii\b/gi, "3"],
  [/\biv\b/gi, "4"],
  [/\bv\b/gi, "5"],
];

/** Auto-generate alias strings for a title. */
export function generateAliases(title: string, originalTitle?: string | null): string[] {
  const out = new Set<string>();
  const base = [title, originalTitle].filter(Boolean) as string[];
  for (const t of base) {
    const norm = normalizeTitle(t);
    if (norm) out.add(norm);
    // Remove subtitle after ":" or "-"
    const noSub = norm.split(/[:\-–—]/)[0].trim();
    if (noSub && noSub !== norm) out.add(noSub);
    // Roman -> digit rewrites
    let rewritten = norm;
    for (const [re, rep] of ROMAN) rewritten = rewritten.replace(re, rep);
    if (rewritten && rewritten !== norm) out.add(rewritten);
    // Drop "the "
    if (norm.startsWith("the ")) out.add(norm.slice(4));
    // Add compact form (no spaces)
    const compact = norm.replace(/\s+/g, "");
    if (compact.length >= 4) out.add(compact);
  }
  return [...out].filter((s) => s.length >= 2);
}

/** Build the search_text blob stored per row. */
export function buildSearchText(m: Partial<MovieRow>): string {
  const parts = [
    m.title,
    (m as any).original_title,
    (m as any).overview,
    (m as any).genres,
    ...(((m as any).aliases as string[] | null) ?? []),
  ]
    .filter(Boolean)
    .map((s) => String(s));
  return normalizeTitle(parts.join(" | "));
}

// ── Dynamic Fuse threshold ─────────────────────────────────────
export function dynamicThreshold(query: string): number {
  const len = query.trim().length;
  if (len <= 4) return 0.25;
  if (len <= 8) return 0.35;
  if (len <= 14) return 0.42;
  return 0.5;
}

// ── Multi-tier search ──────────────────────────────────────────
export interface SearchOptions {
  language?: string | null;
  quality?: string | null;
  year?: string | number | null;
  limit?: number;
}

function applyFilters(list: MovieRow[], opts: SearchOptions): MovieRow[] {
  return list.filter((m) => {
    if (opts.language && (m.language || "").toLowerCase() !== opts.language.toLowerCase())
      return false;
    if (opts.quality && (m.quality || "").toLowerCase() !== opts.quality.toLowerCase())
      return false;
    if (opts.year && String(m.year) !== String(opts.year)) return false;
    return true;
  });
}

/** Multi-tier search: exact → normalized → alias → fuzzy → partial. */
export function smartSearch(
  list: MovieRow[],
  rawQuery: string,
  opts: SearchOptions = {},
): MovieRow[] {
  const limit = opts.limit ?? 25;
  const q = rawQuery.trim();
  if (!q) return [];
  const qNorm = normalizeTitle(q);
  const qLight = lightNormalize(q);
  const filtered = applyFilters(list, opts);
  const seen = new Set<number>();
  const out: MovieRow[] = [];
  const push = (m: MovieRow) => {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    out.push(m);
  };

  // 1) Exact title (case-insensitive)
  for (const m of filtered) {
    if (m.title.toLowerCase() === q.toLowerCase()) push(m);
  }
  // 2) Normalized match
  for (const m of filtered) {
    if (normalizeTitle(m.title) === qNorm) push(m);
    else if ((m as any).original_title && normalizeTitle((m as any).original_title) === qNorm)
      push(m);
  }
  // 3) Alias match
  for (const m of filtered) {
    const aliases: string[] = ((m as any).aliases as string[] | null) ?? [];
    if (aliases.some((a) => a === qNorm || a === qLight)) push(m);
  }
  // 4) Substring match on title / original_title / search_text
  for (const m of filtered) {
    const t = normalizeTitle(m.title);
    const orig = normalizeTitle((m as any).original_title || "");
    const st = ((m as any).search_text as string | null) || "";
    if (t.includes(qNorm) || orig.includes(qNorm) || st.includes(qNorm)) push(m);
  }
  if (out.length >= limit) return out.slice(0, limit);

  // 5) Fuse fuzzy over multi-field search space
  const fuse = new Fuse(filtered, {
    keys: [
      { name: "title", weight: 0.45 },
      { name: "original_title", weight: 0.2 },
      { name: "aliases", weight: 0.25 },
      { name: "search_text", weight: 0.1 },
    ],
    threshold: dynamicThreshold(qNorm || q),
    ignoreLocation: true,
    minMatchCharLength: Math.min(3, Math.max(2, Math.floor(qNorm.length / 3))),
    includeScore: true,
  });
  for (const r of fuse.search(qNorm || q)) push(r.item);

  return dedupeAndRank(out, rawQuery).slice(0, limit);
}

/** Fuzzy suggestions when smartSearch returns nothing. */
export function fuzzySuggest(list: MovieRow[], rawQuery: string, limit = 5): MovieRow[] {
  const qNorm = normalizeTitle(rawQuery);
  if (!qNorm) return [];
  const fuse = new Fuse(list, {
    keys: [
      { name: "title", weight: 0.5 },
      { name: "original_title", weight: 0.2 },
      { name: "aliases", weight: 0.3 },
    ],
    threshold: Math.min(0.6, dynamicThreshold(qNorm) + 0.15),
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  });
  return fuse.search(qNorm).slice(0, limit).map((r) => r.item);
}

// ── Dedupe + rank ──────────────────────────────────────────────
/**
 * Deduplicate by tmdb_id → imdb_id → normalized(title)+year, and
 * sort by: exact normalized title match, then year desc (newest first),
 * then original list order (which reflects search relevance / popularity).
 */
export function dedupeAndRank(list: MovieRow[], rawQuery: string): MovieRow[] {
  const qNorm = normalizeTitle(rawQuery);
  const seen = new Map<string, MovieRow>();
  const order = new Map<number, number>();
  list.forEach((m, i) => order.set(m.id, i));
  for (const m of list) {
    // Keep every distinct version (quality / language / year / file).
    // Only collapse truly identical duplicate rows (same file_id or exact same metadata combo).
    const variant = `${m.year ?? ""}|${(m.language || "").toLowerCase()}|${(m.quality || "").toLowerCase()}|${m.file_id || ""}`;
    const base = (m as any).tmdb_id
      ? `t:${(m as any).tmdb_id}`
      : (m as any).imdb_id
        ? `i:${(m as any).imdb_id}`
        : `n:${normalizeTitle(m.title)}`;
    const key = `${base}|${variant}`;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, m); continue; }
    // Prefer verified / archived / newer id
    const better =
      (((m as any).tmdb_verified ? 1 : 0) - ((prev as any).tmdb_verified ? 1 : 0)) ||
      ((m.storage_message_id ? 1 : 0) - (prev.storage_message_id ? 1 : 0)) ||
      (m.id - prev.id);
    if (better > 0) seen.set(key, m);
  }
  const arr = [...seen.values()];
  arr.sort((a, b) => {
    const ax = normalizeTitle(a.title) === qNorm ? 1 : 0;
    const bx = normalizeTitle(b.title) === qNorm ? 1 : 0;
    if (ax !== bx) return bx - ax;
    const ay = a.year ?? 0;
    const by = b.year ?? 0;
    if (ay !== by) return by - ay;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
  return arr;
}

/** Convenience: is the top result an exact (normalized) title match with no other exact matches? */
export function isSingleExactMatch(list: MovieRow[], rawQuery: string): boolean {
  const qNorm = normalizeTitle(rawQuery);
  if (!qNorm || list.length === 0) return false;
  const exact = list.filter((m) => normalizeTitle(m.title) === qNorm);
  return exact.length === 1;
}