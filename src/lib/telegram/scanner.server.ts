import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSettings } from "./settings.server";
import { indexChannelPost } from "./autoindex.server";

export interface ScanProgress {
  from: number;
  to: number;
  next: number;
  inserted: number;
  updated: number;
  skipped: number;
  empty: number;
  errors: number;
  running: boolean;
  started_at: string | null;
}

const KEY = "scan_progress";

export async function getScanProgress(): Promise<ScanProgress | null> {
  const { data } = await supabaseAdmin.from("bot_settings").select("value").eq("key", KEY).maybeSingle();
  return (data?.value as any) ?? null;
}

export async function saveScanProgress(p: ScanProgress) {
  await supabaseAdmin.from("bot_settings").upsert(
    { key: KEY, value: p as any, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
}

export function newScan(from: number, to: number): ScanProgress {
  return { from, to, next: from, inserted: 0, updated: 0, skipped: 0, empty: 0, errors: 0, running: true, started_at: new Date().toISOString() };
}

/**
 * Bots cannot read channel history, so each old post is forwarded to a helper
 * chat (the admin), read, then the forwarded copy is deleted immediately.
 * Processes up to `batch` message IDs, keeping time under the webhook limit.
 */
export async function runScanBatch(api: any, helperChatId: number, p: ScanProgress, batch = 40): Promise<ScanProgress> {
  const s = await getSettings();
  const storage = Number(s.storage_channel_id);
  const deadline = Date.now() + 45_000;
  let n = 0;
  while (p.next <= p.to && n < batch && Date.now() < deadline) {
    const mid = p.next;
    p.next++;
    n++;
    let fwd: any = null;
    try {
      fwd = await api.forwardMessage(helperChatId, storage, mid, { disable_notification: true });
    } catch (e) {
      const d = String((e as any)?.description || (e as Error).message);
      if (/retry after (\d+)/i.test(d)) {
        const secs = Number(d.match(/retry after (\d+)/i)![1]);
        p.next--; n--;
        if (Date.now() + secs * 1000 > deadline) break;
        await new Promise((r) => setTimeout(r, secs * 1000));
        continue;
      }
      p.empty++;
      continue;
    }
    try { await api.deleteMessage(helperChatId, fwd.message_id); } catch { /* ignore */ }
    if (!fwd?.video && !fwd?.document) { p.empty++; continue; }
    try {
      const msg = { ...fwd, chat: { id: storage }, message_id: mid };
      const r = await indexChannelPost(msg, false, true);
      if (r.status === "inserted") p.inserted++;
      else if (r.status === "updated") p.updated++;
      else if (r.status === "error") p.errors++;
      else p.skipped++;
    } catch {
      p.errors++;
    }
  }
  if (p.next > p.to) p.running = false;
  await saveScanProgress(p);
  return p;
}
