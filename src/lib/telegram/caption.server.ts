export const KNOWN_LANGUAGES = [
  "hindi", "english", "tamil", "telugu", "malayalam", "kannada",
  "dual audio", "multi audio", "punjabi", "bengali", "marathi", "gujarati",
];

// Short/typo language codes → canonical language
const LANG_ALIASES: Record<string, string> = {
  hin: "hindi", hind: "hindi", hindii: "hindi", hindu: "hindi",
  eng: "english", engl: "english", englis: "english", englsh: "english", inglish: "english",
  tam: "tamil", tel: "telugu", telgu: "telugu", mal: "malayalam", kan: "kannada", kann: "kannada",
  ben: "bengali", bangla: "bengali", mar: "marathi", pun: "punjabi", guj: "gujarati",
};

const QUALITY_TOKENS = ["2160p","1440p","1080p","720p","540p","480p","360p","4K","UHD","HDR","HD","SD"];

// Release/encode/promo junk that must never reach the title.
const JUNK_TOKENS = [
  "hdts","hdtc","hdcam","camrip","cam","ts","tc","predvd","pre dvd","dvdscr","hdrip","dvdrip","brrip","bdrip",
  "bluray","blu ray","web dl","webdl","web rip","webrip","web","hdtv","amzn","nf","hotstar","zee5","jiocinema",
  "clean","proper","uncut","hevc","x264","x265","h264","h265","h 264","h 265","10bit","8bit","aac","dd5 1","ddp5 1","5 1","2 0",
  "aac2 0","aac2","aac5 1","ddp 5 1","ddp 5","ddp","dd 5 1","dd","ac3","eac3","atmos","dts","truehd","flac","opus",
  "ds4k","4k","uhd","hdr","dv","dolby","vision","sdr","imax","ott","repack","remux","rerip","internal","limited",
  "jh","psa","yts","rarbg","galaxyrg","tg","hq","hc","hdrip","sony","sonyliv","jio","prime","netflix","dsnp","aha","sun","sunnxt",
  "esub","esubs","msubs","subs","sub","org","original","line","audio","dubbed","hdr10","mkv","mp4","avi",
  "full movie","movie","film","print","new","latest","exclusive","uploaded","by","join","telegram","channel",
];

export function qualityFromSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return null;
  if (mb <= 800) return "480p";
  if (mb <= 1331) return "720p";
  if (mb <= 2560) return "1080p";
  return "4K";
}

export function humanSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export interface ParsedCaption {
  name: string;
  year: number | null;
  language: string | null;
  quality: string | null;
  part: number | null;
}

/** Remove promo tails, handles, urls, emojis and encode tags. */
export function stripJunk(raw: string): string {
  let s = (raw || "").replace(/[\r\n]+/g, " ");
  // Fancy small-caps promo words ("Pʟᴇᴀꜱᴇ Fᴏʀᴡᴀʀᴅ…") and forward/save notices
  s = s.replace(/\S*[\u0250-\u02AF\u1D00-\u1DBF\uA720-\uA7FF]\S*/g, " ");
  s = s.replace(/\b(please\s+)?forward\s+(your|this|the)\b.*$/i, " ");
  s = s.replace(/\b(powered|uploaded|presented|shared|brought)\s*by\b.*$/i, " ");
  s = s.replace(/https?:\/\/\S+|www\.\S+|t\.me\/\S+|@[\w]+/gi, " ");
  s = s.replace(/[\p{Extended_Pictographic}\u2600-\u27BF\uFE0F\u200D]/gu, " ");
  s = s.replace(/\.(mkv|mp4|avi|webm|mov|m4v)\b/gi, " ");
  s = s.replace(/\b\d+(\.\d+)?\s*(mb|gb)\b/gi, " ");
  s = s.replace(/[._\-\[\]\(\)\{\}|:+,]+/g, " ");
  for (const j of [...JUNK_TOKENS].sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(`\\b${j.replace(/ /g, "\\s+")}\\b`, "gi"), " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

/** Parse "War 2019 720p Hindi" / "Street Fighter HDTS Hindi Telugu CLEAN mkv ⛩️ Powered By : X" */
export function parseCaption(raw: string): ParsedCaption {
  const original = (raw || "").replace(/[\r\n]+/g, " ").trim();
  if (!original) return { name: "", year: null, language: null, quality: null, part: null };
  let s = original.replace(/\b(powered|uploaded|presented|shared|brought)\s*by\b.*$/i, " ");
  s = s.replace(/[._]+/g, " ");
  const yearM = s.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearM ? Number(yearM[0]) : null;
  if (yearM) s = s.replace(yearM[0], " ");

  let quality: string | null = null;
  for (const q of QUALITY_TOKENS) {
    const re = new RegExp(`\\b${q}\\b`, "i");
    if (re.test(s)) {
      const low = q.toLowerCase();
      quality = low === "4k" || low === "uhd" || low === "2160p" ? "4K" : low === "hdr" ? "HDR" : low;
      s = s.replace(re, " ");
      break;
    }
  }

  // Collect all languages; 2+ → Dual/Multi Audio
  const langs: string[] = [];
  for (const lang of [...KNOWN_LANGUAGES].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${lang.replace(/ /g, "\\s+")}\\b`, "gi");
    if (re.test(s)) {
      langs.push(lang);
      s = s.replace(re, " ");
    }
  }
  for (const [code, lang] of Object.entries(LANG_ALIASES)) {
    const re = new RegExp(`\\b${code}\\b`, "gi");
    if (re.test(s)) {
      if (!langs.includes(lang)) langs.push(lang);
      s = s.replace(re, " ");
    }
  }
  let language: string | null = null;
  const cap = (l: string) => l.replace(/\b\w/g, (c) => c.toUpperCase());
  if (langs.some((l) => l.includes("audio"))) language = cap(langs.find((l) => l.includes("audio"))!);
  else if (langs.length >= 3) language = "Multi Audio";
  else if (langs.length === 2) language = "Dual Audio";
  else if (langs.length === 1) language = cap(langs[0]);

  let part: number | null = null;
  const partM = s.match(/\b(?:part|pt|chapter|vol)\s*(\d{1,2})\b/i);
  if (partM) part = Number(partM[1]);

  let name = stripJunk(s);
  // Drop trailing stray single letters / bare numbers left by tags (e.g. "Tam T", "H 264")
  name = name.replace(/(\s+(?:[a-z]|\d{3,}))+$/i, "").trim();
  return { name, year, language, quality, part };
}

/** Normalise a title for request ↔ movie matching. */
export function matchKey(s: string): string {
  return stripJunk(s.replace(/\(\s*\d{4}\s*\)/g, " ").replace(/\b(19|20)\d{2}\b/g, " "))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a request title refers to the given movie title (handles junk + sequels). */
export function requestMatchesMovie(reqTitle: string, movieTitle: string): boolean {
  const r = matchKey(reqTitle);
  const m = matchKey(movieTitle);
  if (!r || !m || r.length < 2) return false;
  if (r === m) return true;
  const num = (x: string) => (x.match(/\b(\d{1,2})$/) || [])[1] || null;
  // sequel guard: "war 2" must not match "war"
  if (num(r) !== num(m) && (num(r) || num(m))) {
    if (!(m.startsWith(r + " ") && !num(r) && !/\b\d{1,2}\b/.test(m.slice(r.length)))) return false;
  }
  return m.startsWith(r + " ") || r.startsWith(m + " ");
}
