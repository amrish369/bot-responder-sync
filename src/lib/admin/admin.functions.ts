import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Admin gate middleware: validates user via requireSupabaseAuth + checks allowlist
async function assertAdmin(claims: any): Promise<string> {
  const email = (claims?.email as string | undefined)?.toLowerCase();
  if (!email) throw new Error("Not authenticated");
  const { isEmailAllowed } = await import("./admin.server");
  const ok = await isEmailAllowed(email);
  if (!ok) throw new Error("Forbidden: not an admin");
  return email;
}

// ─── Dashboard stats ──────────────────────────────────────────
export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [movies, users, banned, reqs, bots, broadcasts, archived] = await Promise.all([
      supabaseAdmin.from("movies").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("tg_users").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("banned").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("bot_tokens").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("broadcast_logs").select("*").order("created_at", { ascending: false }).limit(5),
      supabaseAdmin.from("movies").select("*", { count: "exact", head: true }).not("storage_message_id", "is", null),
    ]);
    const activeSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: activeUsers } = await supabaseAdmin
      .from("tg_users").select("*", { count: "exact", head: true }).gte("last_seen", activeSince);
    return {
      totalMovies: movies.count ?? 0,
      totalUsers: users.count ?? 0,
      activeUsers: activeUsers ?? 0,
      bannedUsers: banned.count ?? 0,
      pendingRequests: reqs.count ?? 0,
      totalBots: bots.count ?? 0,
      archivedMovies: archived.count ?? 0,
      recentBroadcasts: broadcasts.data ?? [],
    };
  });

// ─── Movies ──────────────────────────────────────────────────
export const listMovies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; limit?: number; offset?: number }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = Math.min(data.limit ?? 50, 200);
    const offset = data.offset ?? 0;
    let q = supabaseAdmin.from("movies").select("*", { count: "exact" })
      .order("id", { ascending: false }).range(offset, offset + limit - 1);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const updateMovieAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number; patch: Record<string, any> }) => d)
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const allowed = ["title", "language", "quality", "year", "type"];
    const patch: Record<string, any> = {};
    for (const k of allowed) if (k in data.patch) patch[k] = data.patch[k];
    const { error } = await supabaseAdmin.from("movies").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    const { logActivity } = await import("./admin.server");
    await logActivity(email, "movie.update", { id: data.id, patch });
    return { ok: true };
  });

export const deleteMovieAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: number[] }) => d)
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("movies").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    const { logActivity } = await import("./admin.server");
    await logActivity(email, "movie.delete", { ids: data.ids });
    return { ok: true, deleted: data.ids.length };
  });

// ─── Users ──────────────────────────────────────────────────
export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; limit?: number; offset?: number }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = Math.min(data.limit ?? 50, 200);
    const offset = data.offset ?? 0;
    let q = supabaseAdmin.from("tg_users").select("*", { count: "exact" })
      .order("last_seen", { ascending: false }).range(offset, offset + limit - 1);
    if (data.search) {
      const s = data.search.trim();
      if (/^\d+$/.test(s)) q = q.eq("telegram_id", Number(s));
      else q = q.or(`username.ilike.%${s}%,first_name.ilike.%${s}%`);
    }
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    // attach banned status
    const ids = (rows ?? []).map((r: any) => r.telegram_id);
    const { data: bans } = ids.length
      ? await supabaseAdmin.from("banned").select("telegram_id").in("telegram_id", ids)
      : { data: [] as any[] };
    const bset = new Set((bans ?? []).map((b: any) => Number(b.telegram_id)));
    return {
      rows: (rows ?? []).map((r: any) => ({ ...r, banned: bset.has(Number(r.telegram_id)) })),
      total: count ?? 0,
    };
  });

export const setUserBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { telegram_id: number; ban: boolean; reason?: string }) => d)
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.ban) {
      await supabaseAdmin.from("banned")
        .upsert({ telegram_id: data.telegram_id, reason: data.reason ?? null }, { onConflict: "telegram_id" });
    } else {
      await supabaseAdmin.from("banned").delete().eq("telegram_id", data.telegram_id);
    }
    const { logActivity } = await import("./admin.server");
    await logActivity(email, data.ban ? "user.ban" : "user.unban", { telegram_id: data.telegram_id });
    return { ok: true };
  });

export const exportUsersCSV = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("tg_users").select("*").limit(50000);
    const rows = data ?? [];
    const header = "telegram_id,username,first_name,joined_at,last_seen,message_count";
    const csv = [header, ...rows.map((r: any) =>
      [r.telegram_id, r.username ?? "", (r.first_name ?? "").replace(/,/g, " "), r.joined_at, r.last_seen, r.message_count].join(",")
    )].join("\n");
    return { csv, count: rows.length };
  });

// ─── Broadcast ──────────────────────────────────────────────
export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string; photo_url?: string }) =>
    z.object({ text: z.string().min(1).max(4000), photo_url: z.string().url().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { BOT_TOKEN } = await import("@/lib/telegram/config.server");
    const token = BOT_TOKEN();
    const { data: users } = await supabaseAdmin.from("tg_users").select("telegram_id").limit(50000);
    const list = (users ?? []).map((u: any) => Number(u.telegram_id));
    let success = 0, failed = 0, blocked = 0, deleted = 0;
    const start = Date.now();
    const endpoint = data.photo_url ? "sendPhoto" : "sendMessage";
    for (const id of list) {
      try {
        const body: any = { chat_id: id };
        if (data.photo_url) { body.photo = data.photo_url; body.caption = data.text; body.parse_mode = "HTML"; }
        else { body.text = data.text; body.parse_mode = "HTML"; }
        const res = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (j.ok) success++;
        else {
          const desc = (j.description || "").toLowerCase();
          if (desc.includes("blocked")) blocked++;
          else if (desc.includes("deactivated") || desc.includes("not found")) deleted++;
          else failed++;
        }
      } catch { failed++; }
      // light rate limit
      if (success % 25 === 0) await new Promise((r) => setTimeout(r, 1000));
    }
    const time_ms = Date.now() - start;
    const { data: log } = await supabaseAdmin.from("broadcast_logs").insert({
      total: list.length, success, failed, blocked, deleted, time_ms,
      admin_id: null, message: data.text.slice(0, 500),
    }).select("id").single();
    const { logActivity } = await import("./admin.server");
    await logActivity(email, "broadcast.send", { total: list.length, success, failed });
    return { id: log?.id, total: list.length, success, failed, blocked, deleted, time_ms };
  });

// ─── Bot tokens ──────────────────────────────────────────────
export const listBotTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("bot_tokens")
      .select("id,name,is_active,enabled,bot_username,notes,created_at,updated_at,token")
      .order("created_at", { ascending: false });
    // mask tokens
    const masked = (data ?? []).map((b: any) => ({
      ...b,
      token_preview: typeof b.token === "string" && b.token.length > 12
        ? b.token.slice(0, 8) + "..." + b.token.slice(-4) : "***",
      token: undefined,
    }));
    return { rows: masked };
  });

export const addBotToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; token: string; notes?: string }) =>
    z.object({
      name: z.string().min(1).max(60),
      token: z.string().regex(/^\d+:[A-Za-z0-9_-]{20,}$/, "Invalid Telegram bot token"),
      notes: z.string().max(500).optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // test the token
    const res = await fetch(`https://api.telegram.org/bot${data.token}/getMe`);
    const j = await res.json();
    if (!j.ok) throw new Error(`Token rejected by Telegram: ${j.description || "unknown"}`);
    const username = j.result?.username ?? null;
    const { data: row, error } = await supabaseAdmin.from("bot_tokens").insert({
      name: data.name, token: data.token, notes: data.notes ?? null, bot_username: username,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const { logActivity } = await import("./admin.server");
    await logActivity(email, "bot.add", { id: row.id, username });
    return { ok: true, id: row.id, username };
  });

export const toggleBotEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number; enabled: boolean }) => d)
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("bot_tokens").update({ enabled: data.enabled, updated_at: new Date().toISOString() }).eq("id", data.id);
    const { logActivity } = await import("./admin.server");
    await logActivity(email, "bot.toggle", { id: data.id, enabled: data.enabled });
    return { ok: true };
  });

export const setActiveBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("bot_tokens").update({ is_active: false }).neq("id", -1);
    await supabaseAdmin.from("bot_tokens").update({ is_active: true, updated_at: new Date().toISOString() }).eq("id", data.id);
    const { logActivity } = await import("./admin.server");
    await logActivity(email, "bot.set_active", { id: data.id });
    return { ok: true };
  });

export const removeBotToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("bot_tokens").delete().eq("id", data.id);
    const { logActivity } = await import("./admin.server");
    await logActivity(email, "bot.remove", { id: data.id });
    return { ok: true };
  });

export const testBotConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("bot_tokens").select("token").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Bot not found");
    const res = await fetch(`https://api.telegram.org/bot${(row as any).token}/getMe`);
    const j = await res.json();
    return { ok: !!j.ok, info: j.result ?? null, error: j.description ?? null };
  });

// ─── Per-bot webhook management ─────────────────────────────
function publicOrigin(): string {
  const env = process.env.PUBLIC_APP_URL || process.env.APP_URL;
  if (env) return env.replace(/\/$/, "");
  const projectId = process.env.SUPABASE_PROJECT_ID || process.env.VITE_SUPABASE_PROJECT_ID;
  // Lovable stable preview URL — works both pre and post publish
  if (projectId) return `https://project--1b722323-ac1e-469f-895f-b63ab16c46ce.lovable.app`;
  return "https://project--1b722323-ac1e-469f-895f-b63ab16c46ce.lovable.app";
}

export const getBotWebhookInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("bot_tokens").select("token").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Bot not found");
    const token = (row as any).token as string;
    const [me, info] = await Promise.all([
      fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()),
      fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json()),
    ]);
    const expectedUrl = `${publicOrigin()}/api/public/telegram/webhook/${data.id}`;
    return {
      ok: !!me.ok,
      me: me.result ?? null,
      webhook: info.result ?? null,
      expectedUrl,
      online: !!me.ok,
      matches: info.result?.url === expectedUrl,
    };
  });

export const registerBotWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number; dropPending?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("bot_tokens").select("token,bot_username").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Bot not found");
    const token = (row as any).token as string;
    const { webhookSecret } = await import("@/lib/telegram/config.server");
    const secret = await webhookSecret(token);
    const webhookUrl = `${publicOrigin()}/api/public/telegram/webhook/${data.id}`;
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: [
          "message", "edited_message", "callback_query",
          "chat_join_request", "my_chat_member", "chat_member",
        ],
        drop_pending_updates: !!data.dropPending,
      }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(`setWebhook failed: ${j.description || "unknown"}`);
    // Refresh bot_username if missing
    if (!(row as any).bot_username) {
      const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
      if (me.ok) {
        await supabaseAdmin.from("bot_tokens").update({
          bot_username: me.result.username, updated_at: new Date().toISOString(),
        }).eq("id", data.id);
      }
    }
    const { logActivity } = await import("./admin.server");
    await logActivity(email, "bot.webhook.register", { id: data.id, url: webhookUrl });
    return { ok: true, url: webhookUrl };
  });

export const deleteBotWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number; dropPending?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("bot_tokens").select("token").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Bot not found");
    const token = (row as any).token as string;
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: !!data.dropPending }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(`deleteWebhook failed: ${j.description || "unknown"}`);
    const { logActivity } = await import("./admin.server");
    await logActivity(email, "bot.webhook.delete", { id: data.id });
    return { ok: true };
  });

export const registerBotCommands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("bot_tokens").select("token").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Bot not found");
    const token = (row as any).token as string;
    const commands = [
      { command: "start", description: "Start the bot" },
      { command: "help", description: "Show all commands" },
      { command: "random", description: "Random movie suggestion" },
      { command: "debate", description: "Live voting" },
      { command: "myrequests", description: "Your movie requests" },
    ];
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commands }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(`setMyCommands failed: ${j.description || "unknown"}`);
    const { logActivity } = await import("./admin.server");
    await logActivity(email, "bot.commands.register", { id: data.id });
    return { ok: true, count: commands.length };
  });

// ─── Activity logs ──────────────────────────────────────────
export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("activity_logs")
      .select("*").order("created_at", { ascending: false }).limit(50);
    return { rows: data ?? [] };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as any)?.email?.toLowerCase() ?? null;
    const { isEmailAllowed } = await import("./admin.server");
    const ok = await isEmailAllowed(email);
    return { ok, email };
  });