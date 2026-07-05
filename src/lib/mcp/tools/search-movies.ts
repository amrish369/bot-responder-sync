import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export default defineTool({
  name: "search_movies",
  title: "Search movies",
  description:
    "Search the movie catalog by title. Returns matching movies with title, year, language, quality, and file size.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Movie title or partial name to search for."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe("Max number of results to return (default 10, max 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }) => {
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
      .select("id,title,year,language,quality,file_size,type")
      .ilike("title", `%${query}%`)
      .order("id", { ascending: false })
      .limit(cap);
    if (error) {
      return { content: [{ type: "text", text: `Search failed: ${error.message}` }], isError: true };
    }
    const rows = data ?? [];
    if (rows.length === 0) {
      return { content: [{ type: "text", text: `No movies found for "${query}".` }] };
    }
    const lines = rows.map(
      (r: any) =>
        `• ${r.title}${r.year ? ` (${r.year})` : ""}${r.language ? ` [${r.language}]` : ""}${r.quality ? ` ${r.quality}` : ""}`,
    );
    return {
      content: [{ type: "text", text: `Found ${rows.length} result(s):\n${lines.join("\n")}` }],
      structuredContent: { results: rows },
    };
  },
});