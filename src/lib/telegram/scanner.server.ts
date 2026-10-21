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
export async function runScanBatch(api: any, helperChatId: number, p: ScanProgress, batch = 8): Promise<ScanProgress> {
  const s = await getSettings();
  const storage = Number(s.storage_channel_id);
  // Telegram webhooks time out ~15-20s; stay well under it.
  const deadline = Date.now() + 10_000;
  let n = 0;
  while (p.next <= p.to && n < batch && Date.now() < deadline) {
    const mid = p.next;
    let fwd: any = null;
    try {
      fwd = await api.forwardMessage(helperChatId, storage, mid, { disable_notification: true });
    } catch (e) {
      const d = String((e as any)?.description || (e as Error).message);
      const m = d.match(/retry after (\d+)/i);
      if (m) break; // flood wait: stop this batch, resume next click
      p.empty++;
      p.next++; n++;
      await saveScanProgress(p);
      continue;
    }
    p.next++; n++;
    try { await api.deleteMessage(helperChatId, fwd.message_id); } catch { /* ignore */ }
    if (!fwd?.video && !fwd?.document) {
      p.empty++;
    } else {
      try {
        const msg = { ...fwd, chat: { id: storage }, message_id: mid };
        const r = await Promise.race([
          indexChannelPost(msg, false, true),
          new Promise<any>((res) => setTimeout(() => res({ status: "error" }), 6000)),
        ]);
        if (r.status === "inserted") p.inserted++;
        else if (r.status === "updated") p.updated++;
        else if (r.status === "error") p.errors++;
        else p.skipped++;
      } catch {
        p.errors++;
      }
    }
    await saveScanProgress(p);
    await new Promise((r) => setTimeout(r, 400));
  }
  if (p.next > p.to) p.running = false;
  await saveScanProgress(p);
  return p;
}
