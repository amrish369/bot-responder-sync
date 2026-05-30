import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface MovieRow {
  id: number;
  title: string;
  file_id: string;
  language: string | null;
  quality: string | null;
  year: number | null;
  type: string | null;
  added_by: number | null;
  created_at: string;
  file_size: number | null;
}

export async function fetchAllMovies(): Promise<MovieRow[]> {
  const { data, error } = await supabaseAdmin
    .from("movies")
    .select("*")
    .order("id", { ascending: true })
    .limit(5000);
  if (error) {
    console.error("[DB] fetchAllMovies", error.message);
    return [];
  }
  return (data as MovieRow[]) ?? [];
}

export async function fetchMovieById(id: number): Promise<MovieRow | null> {
  const { data } = await supabaseAdmin.from("movies").select("*").eq("id", id).maybeSingle();
  return (data as MovieRow) ?? null;
}

export async function insertMovie(
  m: Omit<MovieRow, "id" | "created_at">,
): Promise<{ movie: MovieRow | null; error: string | null }> {
  const { data, error } = await supabaseAdmin.from("movies").insert(m).select().single();
  if (error) {
    console.error("[DB] insertMovie", error.message);
    return { movie: null, error: error.message };
  }
  return { movie: data as MovieRow, error: null };
}

export async function updateMovie(
  id: number,
  patch: Partial<Omit<MovieRow, "id" | "created_at">>,
): Promise<{ movie: MovieRow | null; error: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("movies").update(patch).eq("id", id).select().single();
  if (error) return { movie: null, error: error.message };
  return { movie: data as MovieRow, error: null };
}

export async function deleteMovie(id: number): Promise<void> {
  await supabaseAdmin.from("movies").delete().eq("id", id);
}

export interface UserRow {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  joined_at: string;
  last_seen: string;
  message_count: number;
}

export async function trackUser(userId: number, firstName?: string, username?: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("tg_users")
    .select("telegram_id, message_count")
    .eq("telegram_id", userId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("tg_users")
      .update({
        last_seen: new Date().toISOString(),
        message_count: (existing.message_count ?? 0) + 1,
        ...(firstName ? { first_name: firstName } : {}),
        ...(username ? { username } : {}),
      })
      .eq("telegram_id", userId);
  } else {
    await supabaseAdmin.from("tg_users").insert({
      telegram_id: userId,
      first_name: firstName || "User",
      username: username || null,
      message_count: 1,
    });
  }
}

export async function getUser(userId: number): Promise<UserRow | null> {
  const { data } = await supabaseAdmin
    .from("tg_users").select("*").eq("telegram_id", userId).maybeSingle();
  return (data as UserRow) ?? null;
}

export async function userDisplayName(userId: number): Promise<string> {
  const u = await getUser(userId);
  if (u?.username) return `@${u.username}`;
  return u?.first_name || `User ${userId}`;
}

export async function isBanned(userId: number): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("banned").select("telegram_id").eq("telegram_id", userId).maybeSingle();
  return !!data;
}

export async function banUser(userId: number, reason?: string): Promise<void> {
  await supabaseAdmin
    .from("banned")
    .upsert({ telegram_id: userId, reason: reason || null }, { onConflict: "telegram_id" });
}

export async function unbanUser(userId: number): Promise<void> {
  await supabaseAdmin.from("banned").delete().eq("telegram_id", userId);
}

export interface RequestRow {
  id: number;
  user_id: number;
  username: string | null;
  title: string;
  status: string;
  created_at: string;
  fulfilled_at: string | null;
}

export async function getUserRequests(userId: number): Promise<RequestRow[]> {
  const { data } = await supabaseAdmin
    .from("requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as RequestRow[]) ?? [];
}

export async function findPendingRequest(userId: number, title: string): Promise<RequestRow | null> {
  const { data } = await supabaseAdmin
    .from("requests")
    .select("*")
    .eq("user_id", userId)
    .ilike("title", title)
    .eq("status", "pending")
    .maybeSingle();
  return (data as RequestRow) ?? null;
}

export async function insertRequest(userId: number, username: string | null, title: string): Promise<RequestRow | null> {
  const { data, error } = await supabaseAdmin
    .from("requests")
    .insert({ user_id: userId, username, title, status: "pending" })
    .select().single();
  if (error) { console.error("[DB] insertRequest", error.message); return null; }
  return data as RequestRow;
}

export async function listPendingRequests(): Promise<RequestRow[]> {
  const { data } = await supabaseAdmin
    .from("requests").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(100);
  return (data as RequestRow[]) ?? [];
}

export async function fulfillRequest(id: number): Promise<RequestRow | null> {
  const { data } = await supabaseAdmin
    .from("requests").update({ status: "fulfilled", fulfilled_at: new Date().toISOString() })
    .eq("id", id).select().single();
  return (data as RequestRow) ?? null;
}

export async function logChat(userId: number, role: "user" | "bot", text: string): Promise<void> {
  await supabaseAdmin.from("chat_logs").insert({
    user_id: userId, role, text: (text ?? "").slice(0, 1000),
  });
}

export async function listAllUsers(): Promise<UserRow[]> {
  const { data } = await supabaseAdmin.from("tg_users").select("*").limit(5000);
  return (data as UserRow[]) ?? [];
}

// payload store (callback button data)
export async function storePayload(data: unknown): Promise<string> {
  const key = Math.random().toString(36).slice(2, 10);
  await supabaseAdmin.from("payload_store").insert({ key, data: data as any });
  return key;
}

export async function getPayload(key: string): Promise<any | null> {
  const { data } = await supabaseAdmin
    .from("payload_store").select("data").eq("key", key).maybeSingle();
  return data?.data ?? null;
}

// pending uploads (admin multi-step)
export async function getPendingUpload(adminId: number): Promise<any | null> {
  const { data } = await supabaseAdmin
    .from("pending_uploads").select("payload").eq("admin_id", adminId).maybeSingle();
  return data?.payload ?? null;
}

export async function setPendingUpload(adminId: number, payload: any): Promise<void> {
  await supabaseAdmin.from("pending_uploads")
    .upsert({ admin_id: adminId, payload, updated_at: new Date().toISOString() }, { onConflict: "admin_id" });
}

export async function clearPendingUpload(adminId: number): Promise<void> {
  await supabaseAdmin.from("pending_uploads").delete().eq("admin_id", adminId);
}

// convo state
export async function getActiveConvo(): Promise<{ admin_id: number; target_user_id: number } | null> {
  const { data } = await supabaseAdmin.from("convos").select("*").limit(1).maybeSingle();
  return data ? { admin_id: Number(data.admin_id), target_user_id: Number(data.target_user_id) } : null;
}

export async function setConvo(adminId: number, targetUserId: number): Promise<void> {
  await supabaseAdmin.from("convos").delete().neq("admin_id", -1); // clear all
  await supabaseAdmin.from("convos").insert({ admin_id: adminId, target_user_id: targetUserId });
}

export async function endConvo(): Promise<void> {
  await supabaseAdmin.from("convos").delete().neq("admin_id", -1);
}