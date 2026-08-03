import { createFileRoute } from "@tanstack/react-router";
import { webhookSecret } from "@/lib/telegram/config.server";
import { createBot } from "@/lib/telegram/bot.server";
import { webhookCallback } from "grammy";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const got = request.headers.get("x-telegram-bot-api-secret-token") || "";
        // Candidate tokens: the env BOT_TOKEN (legacy) and the active panel bot.
        const candidates: string[] = [];
        try { candidates.push(process.env.BOT_TOKEN!); } catch { /* ignore */ }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: active } = await supabaseAdmin
          .from("bot_tokens").select("id,token").eq("is_active", true).eq("enabled", true).maybeSingle();
        if (active?.token) candidates.push((active as any).token as string);

        let token: string | null = null;
        for (const c of candidates.filter(Boolean)) {
          if ((await webhookSecret(c)) === got) { token = c; break; }
        }
        if (!token) return new Response("Unauthorized", { status: 401 });
        const activeBotId = active?.token === token ? Number(active.id) : null;
        const bot = createBot(token, Number.isFinite(activeBotId) ? activeBotId : null);
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