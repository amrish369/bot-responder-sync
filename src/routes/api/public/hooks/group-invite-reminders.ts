import { createFileRoute } from "@tanstack/react-router";
import { verifyHookSecret } from "@/lib/telegram/hook-auth.server";

async function run() {
  const { runInviteCampaign } = await import("@/lib/telegram/growth.server");
  return await runInviteCampaign("remind");
}

export const Route = createFileRoute("/api/public/hooks/group-invite-reminders")({
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