## Goal

Run `bot.js` behavior on Lovable's backend (Cloudflare Workers SSR) — same commands, same replies, same keyboards — minus **daily 5 movies** and **daily debate**.

## Why the original can't run as-is

- `bot.start()` long-polling → Workers can't keep a process alive. Switch to **Telegram webhooks**.
- `better-sqlite3`, `child_process.exec` (git auto-sync) → no native modules / no subprocesses on Workers. Drop the git auto-sync; use Postgres for state.
- `fs.writeFile` to `movies.json`, `banned.json`, `requests`, `users`, `dailyQueue.json`, `debates.json`, `chatLogs.json`, `genreCache.json` → no writable FS. Move to Lovable Cloud (Postgres).

User-facing messages, keyboards, button labels, emoji, and reply formats stay identical.

## Setup

1. Enable **Lovable Cloud** (Postgres + secrets).
2. Add secrets: `BOT_TOKEN`, `TMDB_API_KEY`, `ADMIN_ID` (comma-separated allowed), `CHANNEL` (default `@cineradarai`), `BOT_USERNAME` (default `cineradarai_bot`).
3. Add `grammy` + `fuse.js` to dependencies (both Workers-compatible).
4. Create webhook route: `src/routes/api/public/telegram/webhook.ts`. Verify `X-Telegram-Bot-Api-Secret-Token` (derive from `BOT_TOKEN` hash so it's stable, same pattern as the Telegram connector docs).
5. After deploy, register webhook with Telegram via `setWebhook` pointing to `https://project--<id>-dev.lovable.app/api/public/telegram/webhook`.

## Database (Lovable Cloud)

Mirror the JSON files as tables, all with RLS enabled + service-role-only policies (only the webhook touches them):

- `movies` — id, title, file_id, language, quality, year, type, added_by, created_at
- `requests` — id, user_id, username, title, status, created_at, fulfilled_at
- `users` — telegram_id (pk), username, first_name, joined_at, last_seen, message_count
- `banned` — telegram_id (pk), reason, banned_at
- `chat_logs` — id, user_id, role, text, created_at
- `convos` — admin_id, target_user_id, started_at (active DM bridges)
- `pending_uploads` — admin_id, payload jsonb (multi-step upload flow state)
- `payload_store` — key, data jsonb, expires_at (replaces the in-memory `requestPayloadStore`)

In-memory caches that are fine to keep per-request (rebuilt each invocation): `MOOD_MAP`, `EMOJI_TO_MOOD`, Fuse index (built on demand from `movies` table).

## Handlers to port (verbatim replies)

Commands: `/start`, `/help`, `/new`, `/upcoming`, `/myrequests`, `/random`, `/debate` (on-demand debate command stays — only the daily auto-debate is removed), `/edit`, `/stats`, `/broadcast`, `/delete`, `/ban`, `/unban`, `/history`, `/delhistory`, `/convo`, `/endconvo`, `/pending`, `/search`, `/dm`, `/queue_add`, `/queue_view`, `/queue_clear`, `/cache_genres`.

Events: `chat_join_request`, `message:new_chat_members`, `my_chat_member`, generic `message` (mood detection, fuzzy movie search, TMDB lookup, force-join check, auto-delete after 3 min, request flow), `callback_query:data` (all inline-button callbacks).

## Explicitly removed

- Daily auto-send of 5 movies (`dailyQueue.json` cron / scheduler logic).
- Daily auto-debate (`debates.json` / `lastDaily.txt` / `lastDailySent.json` scheduled posting).
- `child_process` git auto-sync.

The `/debate` command and the request/queue admin commands stay so admins can still manage things manually.

## File layout

```
src/
├── routes/api/public/telegram/webhook.ts   # POST handler, verifies secret, hands update to bot
├── lib/telegram/
│   ├── bot.server.ts                        # grammy Bot instance + handler registration
│   ├── db.server.ts                         # Postgres helpers (movies, users, requests, etc.)
│   ├── tmdb.server.ts                       # TMDB API helpers
│   ├── mood.ts                              # MOOD_MAP + detectMood (pure)
│   ├── force-join.server.ts                 # channel-join enforcement
│   ├── handlers/
│   │   ├── commands.server.ts               # /start, /help, /new, /random, /search, ...
│   │   ├── admin.server.ts                  # /stats, /broadcast, /ban, /unban, /delete, /edit, /dm, /history, /delhistory, /convo, /endconvo, /pending, /queue_*, /cache_genres
│   │   ├── messages.server.ts               # generic on('message') logic
│   │   └── callbacks.server.ts              # on('callback_query:data')
│   └── auto-delete.server.ts                # schedules deletion via setTimeout per request (Worker-lifetime; acceptable since webhook invocations are short-lived — uses `ctx.waitUntil` equivalent)
```

Note on auto-delete: original uses 3-min `setTimeout`. Workers terminate after the response, so we'll use `event.waitUntil(new Promise(r => setTimeout(..., 3*60_000)))` if available, else delete on the next user interaction. Documented behavior is preserved best-effort.

## Validation

- After deploy, call `getWebhookInfo` to confirm registration.
- Send `/start` from Telegram; verify reply text matches original.
- Send a movie name; verify fuzzy match + TMDB poster + auto-delete behavior.
- Admin: `/stats` returns user/movie counts.

## Open dependency on user

I need from you (will request via the secrets tool after you confirm this plan):
- `BOT_TOKEN`
- `TMDB_API_KEY`
- `ADMIN_ID` (comma-separated)
- `CHANNEL` (e.g. `@cineradarai`) — optional, has default
- `BOT_USERNAME` — optional, has default

GitHub connection itself must be done by you from the editor: **Plus (+) menu → GitHub → Connect project**.
