import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSettings, asHttpsLink, normaliseChatRef } from "./settings.server";
import { getUserGateStatus } from "./membership.server";

const JOINED = new Set(["member", "administrator", "creator", "restricted"]);

export interface MembershipPatch {
  started?: boolean;
  main_joined?: boolean;
  backup_joined?: boolean;
  channel_joined?: boolean;
  blocked?: boolean;
  last_error?: string | null;
  last_invited?: string;
  last_reminded?: string;
  reminder_count?: number;
}

export async function upsertMembership(telegramId: number, patch: MembershipPatch) {
  await supabaseAdmin.from("group_membership").upsert(
    {
      telegram_id: telegramId,
      ...patch,
      last_checked: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "telegram_id" },
  );
}

/** Map a chat_member update to the right membership column. */
export async function trackChatMemberUpdate(update: any) {
  const userId = Number(update?.new_chat_member?.user?.id);
  const chatId = Number(update?.chat?.id);
  const username = (update?.chat?.username || "").toLowerCase();
  if (!Number.isFinite(userId) || update?.new_chat_member?.user?.is_bot) return;

  const s = await getSettings();
  const joined = JOINED.has(update?.new_chat_member?.status);
  const match = (link: string | null) => {
    const ref = normaliseChatRef(link || "");
    if (!ref) return false;
    if (ref.startsWith("@")) return ref.slice(1).toLowerCase() === username;
    return Number(ref) === chatId;
  };

  const patch: MembershipPatch = {};
  if (match(s.main_group_link)) patch.main_joined = joined;
  if (match(s.backup_group_link)) patch.backup_joined = joined;
  if (match(s.force_join_link)) patch.channel_joined = joined;
  if (Object.keys(patch).length === 0) return;
  await upsertMembership(userId, patch);
}

export function inviteKeyboardRows(s: Awaited<ReturnType<typeof getSettings>>) {
  const rows: Array<Array<{ text: string; url: string }>> = [];
  const main = asHttpsLink(s.main_group_link);
  const backup = asHttpsLink(s.backup_group_link);
  const channel = asHttpsLink(s.force_join_link);
  if (main) rows.push([{ text: "➕ Join Main Group", url: main }]);
  if (channel && channel !== main) rows.push([{ text: "📢 Join Channel", url: channel }]);
  if (backup && backup !== main) rows.push([{ text: "🗂️ Backup Group", url: backup }]);
  return rows;
}

function inviteText(reminder: boolean) {
  return reminder
    ? "🔔 <b>Reminder</b>\n\nAap abhi tak hamare main group me join nahi hue.\n" +
      "Group me sabse pehle nayi movies, requests aur fast links milte hain.\n\n" +
      "👇 Ek tap me join karein:"
    : "🎬 <b>Join CineRadar Community!</b>\n\n" +
      "• Nayi movies sabse pehle\n• Request karo, turant delivery\n• Backup group me saari files safe\n\n" +
      "👇 Ek tap me join karein:";
}

async function activeBotToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("bot_tokens").select("token").eq("is_active", true).eq("enabled", true).maybeSingle();
  if ((data as any)?.token) return (data as any).token as string;
  const { data: any1 } = await supabaseAdmin
    .from("bot_tokens").select("token").eq("enabled", true).limit(1).maybeSingle();
  if ((any1 as any)?.token) return (any1 as any).token as string;
  return process.env["BOT_TOKEN"] ?? null;
}

export interface CampaignResult {
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  skipped: number;
  errors: string[];
}

/** Minimal Telegram API adapter for membership checks (no grammY instance needed). */
function tokenApi(token: string) {
  const call = async (method: string, body: any) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j: any = await res.json();
    if (!j.ok) throw new Error(j.description || method + " failed");
    return j.result;
  };
  return {
    getChatMember: (chat_id: string | number, user_id: number) =>
      call("getChatMember", { chat_id, user_id }),
    sendChatAction: (chat_id: number, action: string) =>
      call("sendChatAction", { chat_id, action }),
  };
}

/**
 * DM every (or every pending) user a one-tap join invite.
 * mode "invite" = all users, "remind" = only users not in the main group,
 * throttled to 1 reminder / 24h and max 3 reminders.
 */
export async function runInviteCampaign(mode: "invite" | "remind"): Promise<CampaignResult> {
  const token = await activeBotToken();
  const out: CampaignResult = { total: 0, sent: 0, failed: 0, blocked: 0, skipped: 0, errors: [] };
  if (!token) {
    out.errors.push("No enabled bot token configured");
    return out;
  }
  const s = await getSettings();
  const rows = inviteKeyboardRows(s);
  if (rows.length === 0) {
    out.errors.push("No group/channel links set in Settings");
    return out;
  }

  const { data: users } = await supabaseAdmin
    .from("tg_users").select("telegram_id").limit(20000);
  const { data: members } = await supabaseAdmin
    .from("group_membership")
    .select("telegram_id,main_joined,blocked,last_reminded,reminder_count")
    .limit(20000);
  const byId = new Map<number, any>((members ?? []).map((m: any) => [Number(m.telegram_id), m]));
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

  const targets: number[] = [];
  for (const u of (users ?? []) as any[]) {
    const id = Number(u.telegram_id);
    const m = byId.get(id);
    if (m?.blocked) { out.blocked++; continue; }
    if (mode === "remind") {
      if (m?.main_joined) { out.skipped++; continue; }
      if ((m?.reminder_count ?? 0) >= 3) { out.skipped++; continue; }
      if (m?.last_reminded && new Date(m.last_reminded).getTime() > dayAgo) { out.skipped++; continue; }
    }
    targets.push(id);
  }
  out.total = targets.length;

  const text = inviteText(mode === "remind");
  const reply_markup = { inline_keyboard: [...rows, [{ text: "✅ Maine Join Kar Liya", callback_data: "verify_join" }]] };

  for (const id of targets) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: id, text, parse_mode: "HTML", reply_markup }),
      });
      const j: any = await res.json().catch(() => ({}));
      if (j.ok) {
        out.sent++;
        const prev = byId.get(id);
        await upsertMembership(id, mode === "remind"
          ? { last_reminded: new Date().toISOString(), reminder_count: Number(prev?.reminder_count ?? 0) + 1 }
          : { last_invited: new Date().toISOString() });
      } else {
        const desc = String(j.description || "unknown");
        if (/blocked|deactivated|chat not found|user is deactivated/i.test(desc)) {
          out.blocked++;
          await upsertMembership(id, { blocked: true, last_error: desc.slice(0, 200) });
        } else {
          out.failed++;
          await upsertMembership(id, { last_error: desc.slice(0, 200) });
        }
        if (out.errors.length < 5) out.errors.push(`${id}: ${desc}`);
      }
    } catch (e) {
      out.failed++;
      if (out.errors.length < 5) out.errors.push(`${id}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 40)); // ~25 msg/sec Telegram limit
  }
  return out;
}

export async function growthStats() {
  const [{ count: totalUsers }, { count: joined }, { count: blocked }] = await Promise.all([
    supabaseAdmin.from("tg_users").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("group_membership").select("*", { count: "exact", head: true }).eq("main_joined", true),
    supabaseAdmin.from("group_membership").select("*", { count: "exact", head: true }).eq("blocked", true),
  ]);
  const total = totalUsers ?? 0;
  const inGroup = joined ?? 0;
  return {
    totalUsers: total,
    joined: inGroup,
    pending: Math.max(0, total - inGroup),
    blocked: blocked ?? 0,
    percent: total ? Math.round((inGroup / total) * 100) : 0,
  };
}

export async function listPendingMembers(limit = 100) {
  const { data: members } = await supabaseAdmin
    .from("group_membership").select("telegram_id").eq("main_joined", true).limit(20000);
  const joinedIds = new Set((members ?? []).map((m: any) => Number(m.telegram_id)));
  const { data: users } = await supabaseAdmin
    .from("tg_users").select("telegram_id,username,first_name,last_seen")
    .order("last_seen", { ascending: false }).limit(5000);
  return (users ?? [])
    .filter((u: any) => !joinedIds.has(Number(u.telegram_id)))
    .slice(0, limit);
}