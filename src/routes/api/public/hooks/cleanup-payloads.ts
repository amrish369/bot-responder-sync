import { createFileRoute } from "@tanstack/react-router";
import { cleanupExpiredPayloads } from "@/lib/telegram/db.server";
import { verifyHookSecret } from "@/lib/telegram/hook-auth.server";

export const Route = createFileRoute("/api/public/hooks/cleanup-payloads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = verifyHookSecret(request);
        if (unauth) return unauth;
        const removed = await cleanupExpiredPayloads();
        return Response.json({ ok: true, removed });
      },
      GET: async ({ request }) => {
        const unauth = verifyHookSecret(request);
        if (unauth) return unauth;
        const removed = await cleanupExpiredPayloads();
        return Response.json({ ok: true, removed });
      },
    },
  },
});