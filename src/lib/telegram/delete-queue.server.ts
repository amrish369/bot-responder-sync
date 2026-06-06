import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Persist a bot message for later auto-deletion. Survives serverless restarts.
 * delaySeconds defaults to settings.autodelete_timer (caller passes it in).
 */
export async function enqueueDelete(
  chatId: number | string,
  messageIds: Array<number | undefined | null>,
  delaySeconds: number,
  botId: number | null = null,
): Promise<void> {
  const ids = messageIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return;
  const at = new Date(Date.now() + Math.max(2, delaySeconds) * 1000).toISOString();
  const rows = ids.map((message_id) => ({
    bot_id: botId,
    chat_id: Number(chatId),
    message_id,
    delete_at: at,
  }));
  const { error } = await supabaseAdmin.from("delete_queue").insert(rows);
  if (error) console.error("[delete-queue] enqueue failed", error.message);
}