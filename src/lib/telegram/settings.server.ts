import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CHANNEL as ENV_CHANNEL,
  BACKUP_CHANNEL as ENV_BACKUP,
} from "./config.server";

export type UploadMode = "normal" | "fast";

export interface BotSettings {
  upload_mode: UploadMode;
  autodelete_status: boolean;
  autodelete_timer: number; // seconds
  force_join_link: string | null;     // @username or https URL
  main_group_link: string | null;     // https URL or @username
  backup_group_link: string | null;   // https URL or @username
  storage_channel_id: number;         // -100... channel id for movie file storage
}

const DEFAULTS: BotSettings = {
  upload_mode: "normal",
  autodelete_status: true,
  autodelete_timer: 10,
  force_join_link: null,
  main_group_link: null,
  backup_group_link: null,
  storage_channel_id: -1004299446417,
};

let cache: { at: number; data: BotSettings } | null = null;
const TTL_MS = 5000;

async function readAll(): Promise<BotSettings> {
  const { data, error } = await supabaseAdmin.from("bot_settings").select("key,value");
  if (error) {
    console.error("[settings] read", error.message);
    return { ...DEFAULTS };
  }
  const merged: any = { ...DEFAULTS };
  for (const row of data ?? []) {
    try {
      merged[(row as any).key] = (row as any).value;
    } catch {}
  }
  // back-fill from env so existing installs work before first /set*
  if (!merged.force_join_link) merged.force_join_link = ENV_CHANNEL();
  if (!merged.main_group_link) merged.main_group_link = linkFromHandle(ENV_CHANNEL());
  if (!merged.backup_group_link) merged.backup_group_link = linkFromHandle(ENV_BACKUP());
  return merged as BotSettings;
}

function linkFromHandle(h: string): string {
  const c = h.replace(/^@/, "");
  return `https://t.me/${c}`;
}

export async function getSettings(force = false): Promise<BotSettings> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = await readAll();
  cache = { at: Date.now(), data };
  return data;
}

export async function setSetting<K extends keyof BotSettings>(
  key: K,
  value: BotSettings[K],
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("bot_settings")
    .upsert({ key, value: value as any, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    console.error("[settings] write", key, error.message);
    throw error;
  }
  cache = null;
}

/** Normalise a user-supplied force-join target to something getChatMember accepts. */
export function normaliseChatRef(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith("@")) return s;
  // https://t.me/xxx or t.me/xxx
  const m = s.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_+]+)\/?$/i);
  if (m) {
    const handle = m[1];
    if (handle.startsWith("+")) return s; // private invite link — not usable for getChatMember
    return `@${handle}`;
  }
  if (/^[A-Za-z0-9_]{4,}$/.test(s)) return `@${s}`;
  return s;
}

/** Best-effort https://t.me/... link from a stored value. */
export function asHttpsLink(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s.startsWith("http")) return s;
  if (s.startsWith("@")) return `https://t.me/${s.slice(1)}`;
  return `https://t.me/${s}`;
}