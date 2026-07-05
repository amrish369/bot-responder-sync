import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export default defineTool({
  name: "recent_movies",
  title: "Recent movies",
  description: "List the most recently added movies in the catalog.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("How many movies to return (default 10, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      return { content: [{ type: "text", text: "Backend not configured." }], isError: true };
    }
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const cap = limit ?? 10;
    const { data, error } = await supabase
      .from("movies")
      .select("id,title,year,language,quality,created_at")
      .order("created_at", { ascending: false })
      .limit(cap);
    if (error) {
      return { content: [{ type: "text", text: `Fetch failed: ${error.message}` }], isError: true };
    }
    const rows = data ?? [];
    const lines = rows.map(
      (r: any) =>
        `• ${r.title}${r.year ? ` (${r.year})` : ""}${r.language ? ` [${r.language}]` : ""}${r.quality ? ` ${r.quality}` : ""}`,
    );
    return {
      content: [
        { type: "text", text: rows.length ? lines.join("\n") : "No movies in the catalog yet." },
      ],
      structuredContent: { results: rows },
    };
  },
});