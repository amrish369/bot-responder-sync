// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { loadEnv } from "vite";

// Public browser configuration only. Keep private credentials out of define.
// Checked-in fallbacks keep publishing independent of sandbox-only .env files.
const publicBackendUrl = "https://tjvfvetllkoygvhdkrpk.supabase.co";
const publicBackendKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdmZ2ZXRsbGtveWd2aGRrcnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDAxODksImV4cCI6MjA5NTM3NjE4OX0.0D3ULL0bBymHvBKz59H_Cy7EhWuZr2a4fgucWezIAnE";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default (configEnv: import("vite").ConfigEnv) => {
  const env = loadEnv(configEnv.mode, process.cwd(), "VITE_");
  return defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL || publicBackendUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(env.VITE_SUPABASE_PUBLISHABLE_KEY || publicBackendKey),
    },
  },
  })(configEnv);
};
