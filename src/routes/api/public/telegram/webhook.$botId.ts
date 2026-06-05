import { createFileRoute } from "@tanstack/react-router";
import { webhookSecret } from "@/lib/telegram/config.server";
import { createBot } from "@/lib/telegram/bot.server";
import { webhookCallback } from "grammy";

export const Route = createFileRoute("/api/public/telegram/webhook/$botId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const botId = Number(params.botId);
        if (!Number.isFinite(botId) || botId <= 0) {
          return new Response("Bad bot id", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("bot_tokens")
          .select("token,enabled")
          .eq("id", botId)
          .maybeSingle();
        if (!row) return new Response("Bot not found", { status: 404 });
        if ((row as any).enabled === false) {
          return new Response("Bot disabled", { status: 200 });
        }
        const token = (row as any).token as string;
        const expected = await webhookSecret(token);
        const got = request.headers.get("x-telegram-bot-api-secret-token") || "";
        if (got !== expected) return new Response("Unauthorized", { status: 401 });

        const bot = createBot(token);
        await bot.init();
        const handler = webhookCallback(bot, "std/http");
        try {
          return await handler(request);
        } catch (e) {
          console.error(`[telegram webhook bot ${botId}]`, (e as Error).message);
          return new Response("ok", { status: 200 });
        }
      },
    },
  },
});