import { createFileRoute } from "@tanstack/react-router";
import { webhookSecret } from "@/lib/telegram/config.server";
import { createBot } from "@/lib/telegram/bot.server";
import { webhookCallback } from "grammy";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = await webhookSecret();
        const got = request.headers.get("x-telegram-bot-api-secret-token") || "";
        if (got !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const bot = createBot();
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