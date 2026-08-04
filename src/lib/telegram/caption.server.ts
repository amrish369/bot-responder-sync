export const KNOWN_LANGUAGES = [
  "hindi", "english", "tamil", "telugu", "malayalam", "kannada",
  "dual audio", "multi audio", "punjabi", "bengali", "marathi",
];

const QUALITY_TOKENS = ["2160p","1440p","1080p","720p","540p","480p","360p","4K","UHD","HDR","HD","SD"];

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
}

/** Parse "War 2019 720p Hindi" / "Dhamaal.3.2023.1080p.Hindi.mkv" style strings. */
export function parseCaption(raw: string): ParsedCaption {
  const original = (raw || "").replace(/[\r\n]+/g, " ").trim();
  if (!original) return { name: "", year: null, language: null, quality: null };
  let s = original.replace(/\.(mkv|mp4|avi|webm|mov|m4v)$/i, " ");
  const yearM = s.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearM ? Number(yearM[0]) : null;
  if (yearM) s = s.replace(yearM[0], " ");

  let quality: string | null = null;
  for (const q of QUALITY_TOKENS) {
    const re = new RegExp(`\\b${q}\\b`, "i");
    if (re.test(s)) {
      const low = q.toLowerCase();
      quality = low === "4k" || low === "uhd" ? "4K" : low === "hdr" ? "HDR" : low;
      s = s.replace(re, " ");
      break;
    }
  }

  let language: string | null = null;
  for (const lang of [...KNOWN_LANGUAGES].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${lang}\\b`, "i");
    if (re.test(s)) {
      language = lang.charAt(0).toUpperCase() + lang.slice(1);
      s = s.replace(re, " ");
      break;
    }
  }

  const name = s
    .replace(/@[\w]+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[._\-\[\]\(\)]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { name, year, language, quality };
}