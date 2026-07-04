import { timingSafeEqual } from "node:crypto";

/**
 * Validates a shared secret on public hook endpoints.
 * Accepts the secret via `X-Hook-Secret` header or `?secret=` query param.
 * Returns null on success, or a Response to short-circuit with 401/500.
 */
export function verifyHookSecret(request: Request): Response | null {
  const expected = process.env.HOOK_SECRET;
  if (!expected) {
    return new Response("HOOK_SECRET not configured", { status: 500 });
  }
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-hook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("secret") ||
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}