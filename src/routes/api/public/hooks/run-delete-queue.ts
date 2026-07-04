import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BOT_TOKEN } from "@/lib/telegram/config.server";
import { verifyHookSecret } from "@/lib/telegram/hook-auth.server";

async function tokenForBot(botId: number | null): Promise<string | null> {
  if (botId) {
    const { data } = await supabaseAdmin
      .from("bot_tokens").select("token,enabled").eq("id", botId).maybeSingle();
    if (data && (data as any).enabled) return (data as any).token as string;
  }
  try { return BOT_TOKEN(); } catch { return null; }
}

async function deleteOne(token: string, chatId: number, messageId: number) {
  const res = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: !!j.ok, desc: (j.description as string) || null };
}

async function runOnce(limit = 200) {
  const { data: rows, error } = await supabaseAdmin
    .from("delete_queue")
    .select("*")
    .lte("delete_at", new Date().toISOString())
    .order("delete_at", { ascending: true })
    .limit(limit);
  if (error) return { error: error.message, processed: 0, deleted: 0, dropped: 0 };

  let deleted = 0, dropped = 0;
  for (const row of rows ?? []) {
    const r: any = row;
    const token = await tokenForBot(r.bot_id ?? null);
    if (!token) {
      await supabaseAdmin.from("delete_queue").delete().eq("id", r.id);
      dropped++;
      continue;
    }
    const { ok, desc } = await deleteOne(token, Number(r.chat_id), Number(r.message_id));
    const fatal = !ok && desc && /not found|message can'?t be deleted|message to delete not found|bot was kicked|chat not found/i.test(desc);
    if (ok || fatal) {
      await supabaseAdmin.from("delete_queue").delete().eq("id", r.id);
      if (ok) deleted++; else dropped++;
    } else {
      const attempts = (r.attempts ?? 0) + 1;
      if (attempts >= 5) {
        await supabaseAdmin.from("delete_queue").delete().eq("id", r.id);
        dropped++;
      } else {
        await supabaseAdmin.from("delete_queue").update({
          attempts, last_error: desc, delete_at: new Date(Date.now() + 60_000).toISOString(),
        }).eq("id", r.id);
      }
    }
  }
  return { processed: (rows ?? []).length, deleted, dropped };
}

export const Route = createFileRoute("/api/public/hooks/run-delete-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = verifyHookSecret(request);
        if (unauth) return unauth;
        return Response.json(await runOnce());
      },
      GET: async ({ request }) => {
        const unauth = verifyHookSecret(request);
        if (unauth) return unauth;
        return Response.json(await runOnce());
      },
    },
  },
});