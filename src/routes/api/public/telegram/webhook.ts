import { createFileRoute } from "@tanstack/react-router";
import { webhookSecret } from "@/lib/telegram/config.server";
import { createBot } from "@/lib/telegram/bot.server";
import { webhookCallback } from "grammy";

async function resolveWebhookToken(secretToken: string): Promise<{ token: string; botId: number | null } | null> {
  const candidates = new Set<string>();

  try {
    const primary = process.env.BOT_TOKEN;
    if (primary) candidates.add(primary);
  } catch {
    // no-op
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("bot_tokens")
    .select("id, token")
    .eq("enabled", true)
    .order("is_active", { ascending: false })
    .limit(50);

  for (const row of rows ?? []) {
    const token = (row as any)?.token;
    if (token) candidates.add(String(token));
  }

  for (const token of Array.from(candidates)) {
    if ((await webhookSecret(token)) === secretToken) {
      const botRow = (rows ?? []).find((row: any) => String(row.token) === String(token));
      return { token, botId: botRow ? Number(botRow.id) : null };
    }
  }

  return null;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const got = request.headers.get("x-telegram-bot-api-secret-token") || "";
        const match = await resolveWebhookToken(got);

        if (!match) {
          return new Response("Unauthorized", { status: 401 });
        }

        const bot = createBot(match.token, match.botId);
        await bot.init();
        const handler = webhookCallback(bot, "std/http");

        try {
          return await handler(request);
        } catch (e) {
          console.error("[telegram webhook]", (e as Error).message);
          return new Response("ok", { status: 200 });
        }
      },
    },
  },
});
