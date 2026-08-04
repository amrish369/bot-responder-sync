import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  // First admin bootstrap: if allowlist is empty, allow first signup
  const { count } = await supabaseAdmin
    .from("admin_allowlist")
    .select("*", { count: "exact", head: true });
  if (!count || count === 0) {
    await supabaseAdmin.from("admin_allowlist").insert({ email: e });
    return true;
  }
  const { data } = await supabaseAdmin
    .from("admin_allowlist")
    .select("email")
    .eq("email", e)
    .maybeSingle();
  return !!data;
}

export async function logActivity(
  email: string | null,
  action: string,
  details: Record<string, unknown> | null = null,
): Promise<void> {
  try {
    await supabaseAdmin.from("activity_logs").insert({
      admin_email: email,
      action,
      details: details as any,
    });
  } catch (e) {
    console.error("[admin] logActivity failed", e);
  }
}
/**
 * Register (or re-register) a bot's own webhook at /api/public/telegram/webhook/<id>.
 * Every bot gets its OWN endpoint + its OWN derived secret, so any number of
 * bots can be live at the same time.
 */
export async function syncBotWebhook(
  botId: number,
  origin: string,
  dropPending = false,
): Promise<{ ok: boolean; url: string; error?: string }> {
  const url = `${origin.replace(/\/$/, "")}/api/public/telegram/webhook/${botId}`;
  const { data: row } = await supabaseAdmin
    .from("bot_tokens").select("token").eq("id", botId).maybeSingle();
  if (!row) return { ok: false, url, error: "Bot not found" };
  const token = (row as any).token as string;
  const { webhookSecret } = await import("@/lib/telegram/config.server");
  const secret = await webhookSecret(token);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: [
          "message", "edited_message", "callback_query",
          "chat_join_request", "my_chat_member", "chat_member",
          "channel_post", "edited_channel_post",
        ],
        drop_pending_updates: dropPending,
      }),
    });
    const j = await res.json();
    if (!j.ok) return { ok: false, url, error: j.description || "setWebhook failed" };
    return { ok: true, url };
  } catch (e) {
    return { ok: false, url, error: (e as Error).message };
  }
}
