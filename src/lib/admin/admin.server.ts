import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  // First admin bootstrap: if allowlist is empty, allow first signup
  const { count } = await supabaseAdmin
    .from("admin_allowlist")
    .select("*", { count: "exact", head: true });
  if (!count || count === 0) {
    await supabaseAdmin.from("admin_allowlist").insert({ email: e });
    return true;
  }
  const { data } = await supabaseAdmin
    .from("admin_allowlist")
    .select("email")
    .eq("email", e)
    .maybeSingle();
  return !!data;
}

export async function logActivity(
  email: string | null,
  action: string,
  details: Record<string, unknown> | null = null,
): Promise<void> {
  try {
    await supabaseAdmin.from("activity_logs").insert({
      admin_email: email,
      action,
      details: details as any,
    });
  } catch (e) {
    console.error("[admin] logActivity failed", e);
  }
}