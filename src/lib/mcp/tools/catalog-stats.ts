import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";

export default defineTool({
  name: "catalog_stats",
  title: "Catalog stats",
  description: "Return total count of movies currently in the catalog.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      return { content: [{ type: "text", text: "Backend not configured." }], isError: true };
    }
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { count, error } = await supabase
      .from("movies")
      .select("*", { count: "exact", head: true });
    if (error) {
      return { content: [{ type: "text", text: `Stats failed: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Catalog contains ${count ?? 0} movies.` }],
      structuredContent: { total: count ?? 0 },
    };
  },
});