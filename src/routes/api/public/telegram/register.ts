import { createFileRoute } from "@tanstack/react-router";
import { BOT_TOKEN, webhookSecret } from "@/lib/telegram/config.server";
import { verifyHookSecret } from "@/lib/telegram/hook-auth.server";

export const Route = createFileRoute("/api/public/telegram/register")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauth = verifyHookSecret(request);
        if (unauth) return unauth;
        const url = new URL(request.url);
        const webhookUrl =
          url.searchParams.get("url") ||
          `${url.origin}/api/public/telegram/webhook`;
        const secret = await webhookSecret();
        const res = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN()}/setWebhook`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              url: webhookUrl,
              secret_token: secret,
              allowed_updates: [
                "message",
                "edited_message",
                "callback_query",
                "chat_join_request",
                "my_chat_member",
                "chat_member",
              ],
              drop_pending_updates: false,
            }),
          },
        );
        const json = await res.json();
        const info = await (
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/getWebhookInfo`)
        ).json();
        return Response.json({ setWebhook: json, webhookInfo: info, webhookUrl });
      },
    },
  },
});