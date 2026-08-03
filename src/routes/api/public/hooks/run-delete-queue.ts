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
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    const j = await res.json().catch(() => ({}));
    return {
      ok: res.ok && !!j.ok,
      code: Number(j.error_code ?? res.status),
      desc: (j.description as string) || `HTTP ${res.status}`,
    };
  } catch (error) {
    return { ok: false, code: 0, desc: (error as Error).message || "Network error" };
  }
}

async function retryOrDrop(row: any, error: string, fatal = false) {
  const attempts = Number(row.attempts ?? 0) + 1;
  if (fatal || attempts >= 5) {
    await supabaseAdmin.from("delete_queue").delete().eq("id", row.id);
    return "dropped" as const;
  }
  const backoffSeconds = Math.min(300, 30 * attempts);
  await supabaseAdmin.from("delete_queue").update({
    attempts,
    last_error: error.slice(0, 1000),
    delete_at: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
  }).eq("id", row.id);
  return "retried" as const;
}

async function runOnce(limit = 500) {
  const { data: rows, error } = await supabaseAdmin
    .from("delete_queue")
    .select("*")
    .lte("delete_at", new Date().toISOString())
    .order("delete_at", { ascending: true })
    .limit(limit);
  if (error) return { error: error.message, processed: 0, deleted: 0, dropped: 0 };

  let deleted = 0, dropped = 0, retried = 0;
  for (const row of rows ?? []) {
    const r: any = row;
    try {
      const token = await tokenForBot(r.bot_id ?? null);
      if (!token) {
        const outcome = await retryOrDrop(r, `Bot token unavailable for bot_id=${r.bot_id ?? "legacy"}`);
        if (outcome === "dropped") dropped++; else retried++;
        continue;
      }
      const { ok, code, desc } = await deleteOne(token, Number(r.chat_id), Number(r.message_id));
      const error = `[${code}] ${desc}`;
      const alreadyGone = !ok && /message to delete not found|message not found/i.test(desc);
      const fatal = !ok && /message can'?t be deleted|bot was kicked|chat not found|not enough rights|need administrator rights/i.test(desc);
      if (ok || alreadyGone) {
        await supabaseAdmin.from("delete_queue").delete().eq("id", r.id);
        if (ok) deleted++; else dropped++;
      } else {
        const outcome = await retryOrDrop(r, error, fatal);
        if (outcome === "dropped") dropped++; else retried++;
      }
    } catch (error) {
      const outcome = await retryOrDrop(r, (error as Error).message || "Unexpected queue error");
      if (outcome === "dropped") dropped++; else retried++;
    }
  }
  return { processed: (rows ?? []).length, deleted, dropped, retried };
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