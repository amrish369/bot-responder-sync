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

export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("admin_allowlist")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const addAdminByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string }) =>
    z.object({ email: z.string().trim().email() }).transform((v) => ({ email: v.email.toLowerCase() })).parse(d)
  )
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalized = data.email.trim().toLowerCase();
    const { data: existing } = await supabaseAdmin
      .from("admin_allowlist")
      .select("id")
      .eq("email", normalized)
      .maybeSingle();
    if (existing) return { ok: true, added: false, email: normalized };

    const { error } = await supabaseAdmin.from("admin_allowlist").insert({ email: normalized });
    if (error) throw new Error(error.message);

    const { logActivity } = await import("./admin.server");
    await logActivity(email, "admin.add", { email: normalized });
    return { ok: true, added: true, email: normalized };
  });

export const removeAdminByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string }) =>
    z.object({ email: z.string().trim().email() }).transform((v) => ({ email: v.email.toLowerCase() })).parse(d)
  )
  .handler(async ({ context, data }) => {
    const email = await assertAdmin(context.claims);
    const normalized = data.email.trim().toLowerCase();
    if (normalized === email) {
      throw new Error("You cannot remove your own admin access.");
    }

    const { count, error: countError } = await supabaseAdmin
      .from("admin_allowlist")
      .select("*", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) <= 1) {
      throw new Error("At least one admin must remain.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_allowlist").delete().eq("email", normalized);
    if (error) throw new Error(error.message);

    const { logActivity } = await import("./admin.server");
    await logActivity(email, "admin.remove", { email: normalized });
    return { ok: true, removed: true, email: normalized };
  });

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

// ... rest of file unchanged
