import { createFileRoute } from "@tanstack/react-router";

const SMALL_FILE_LIMIT = 20 * 1024 * 1024;

async function resolveToken(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("bot_tokens")
    .select("token")
    .eq("is_active", true)
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  return ((data as any)?.token as string) || process.env["BOT_TOKEN"] || null;
}

export const Route = createFileRoute("/api/public/dl/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = Number(params.id);
        if (!Number.isFinite(id) || id <= 0) return new Response("Bad id", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: movie } = await supabaseAdmin
          .from("movies")
          .select("id,title,file_id,file_size,file_kind")
          .eq("id", id)
          .maybeSingle();

        if (!movie) return new Response("Not found", { status: 404 });

        const size = Number((movie as any).file_size ?? 0);
        if (!size || size > SMALL_FILE_LIMIT) {
          return new Response(
            "File is too large for direct download. Use the Telegram download button on the movie page.",
            { status: 413 },
          );
        }

        const token = await resolveToken();
        if (!token) return new Response("Bot not configured", { status: 503 });

        const infoRes = await fetch(
          `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent((movie as any).file_id)}`,
        );
        const info = (await infoRes.json()) as any;
        if (!info?.ok || !info?.result?.file_path) {
          return new Response("File unavailable", { status: 502 });
        }

        const fileRes = await fetch(
          `https://api.telegram.org/file/bot${token}/${info.result.file_path}`,
        );
        if (!fileRes.ok || !fileRes.body) return new Response("Download failed", { status: 502 });

        const ext = String(info.result.file_path).split(".").pop() || "bin";
        const safeName = String((movie as any).title).replace(/[^\w\-. ]+/g, "_").slice(0, 80);

        return new Response(fileRes.body, {
          status: 200,
          headers: {
            "Content-Type": fileRes.headers.get("content-type") || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${safeName}.${ext}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});