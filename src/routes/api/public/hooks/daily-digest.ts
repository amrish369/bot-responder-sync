import { createFileRoute } from "@tanstack/react-router";
import { verifyHookSecret } from "@/lib/telegram/hook-auth.server";

async function run() {
  const { runMorningDigest } = await import("@/lib/telegram/digest.server");
  return await runMorningDigest();
}

export const Route = createFileRoute("/api/public/hooks/daily-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = verifyHookSecret(request);
        if (unauth) return unauth;
        return Response.json(await run());
      },
      GET: async ({ request }) => {
        const unauth = verifyHookSecret(request);
        if (unauth) return unauth;
        return Response.json(await run());
      },
    },
  },
});
