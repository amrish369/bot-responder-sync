import { createFileRoute } from "@tanstack/react-router";
import { cleanupExpiredPayloads } from "@/lib/telegram/db.server";

export const Route = createFileRoute("/api/public/hooks/cleanup-payloads")({
  server: {
    handlers: {
      POST: async () => {
        const removed = await cleanupExpiredPayloads();
        return Response.json({ ok: true, removed });
      },
      GET: async () => {
        const removed = await cleanupExpiredPayloads();
        return Response.json({ ok: true, removed });
      },
    },
  },
});