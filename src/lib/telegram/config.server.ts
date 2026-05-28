const required = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
};

export const BOT_TOKEN = () => required("BOT_TOKEN");
export const TMDB_API_KEY = () => required("TMDB_API_KEY");
export const CHANNEL = () => process.env.CHANNEL || "@cinebotbackupgroup";
export const CHANNEL_USERNAME = () => (process.env.CHANNEL || "@cinebotbackupgroup").replace("@", "");
// Backup / secondary group users can also join to pass force-join
export const BACKUP_CHANNEL = () => process.env.BACKUP_CHANNEL || "@cinebotbook";
export const BACKUP_CHANNEL_USERNAME = () =>
  (process.env.BACKUP_CHANNEL || "@cinebotbook").replace("@", "");
export const BOT_USERNAME = () => process.env.BOT_USERNAME || "cineradarai_bot";

export const ADMIN_IDS = (): Set<number> =>
  new Set(
    (process.env.ADMIN_ID || "5951923988")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );

export const PRIMARY_ADMIN = (): number => [...ADMIN_IDS()][0];
export const isAdmin = (id: number | undefined | null): boolean =>
  !!id && ADMIN_IDS().has(Number(id));

export const AUTO_DELETE_MS = 3 * 60 * 1000;
export const TMDB_BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
export const WEBSITE_URL = "https://www.compressdocument.in/";
export const INSTAGRAM_URL =
  "https://www.instagram.com/_www.compressdocument.in?igsh=MzNtdGVoeHp3YWhq";

// Derived webhook secret (stable, matches Telegram setWebhook value)
export async function webhookSecret(): Promise<string> {
  const enc = new TextEncoder().encode(`telegram-webhook:${BOT_TOKEN()}`);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}