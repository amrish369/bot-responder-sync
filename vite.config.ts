
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { loadEnv } from "vite";

// Public browser configuration only.
const publicBackendUrl = "https://uobztbtzicdxobgxmygg.supabase.co";

// Replace this with the publishable key from your Supabase project.
const publicBackendKey = "sb_publishable_xzvDTqj1J9iI9BAOid6dZA_GQeEM7J2";

export default (configEnv: import("vite").ConfigEnv) => {
  const env = loadEnv(configEnv.mode, process.cwd(), "VITE_");

  return defineConfig({
    tanstackStart: {
      server: { entry: "server" },
    },
    vite: {
      plugins: [mcpPlugin()],
      define: {
        "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
          env.VITE_SUPABASE_URL || publicBackendUrl
        ),
        "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
          env.VITE_SUPABASE_PUBLISHABLE_KEY || publicBackendKey
        ),
      },
    },
  })(configEnv);
};

