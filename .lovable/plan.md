## Plan — 5 fixes for the Telegram Movie Bot

I'll ship these in **2 batches** so each one is verifiable. Do not mix them — that's what caused half-working features before.

---

### Batch 1 — Critical bot fixes (ship first)

**Fix 1: Auto-delete (3 min) — both DMs and groups**
Right now there's no scheduler. I'll add:
- `delete_queue` table: `chat_id, message_id, delete_at`
- After every movie send (DM + group), insert all sent message IDs (movie + caption + warning) with `delete_at = now() + interval '3 minutes'`
- New public route `/api/public/hooks/run-delete-queue` — picks rows where `delete_at <= now()`, calls `deleteMessage` per bot, removes row on success or on "message to delete not found"
- `pg_cron` job every 1 minute hits that route
- Admin UI toggle + minutes input in `/admin/settings` (new page)

**Fix 2: Force-join cross-check (bot + main channel + backup group)**
Currently force-join only checks one channel. I'll:
- Read `FORCE_JOIN_CHANNELS` array from `bot_settings` (main channel id, backup group id — both editable in admin panel)
- Before serving any movie, loop `getChatMember(chat, user_id)` over each; if any returns `left/kicked` → reply with join buttons for the missing one(s) + "✅ I've Joined" callback
- "I've Joined" callback re-runs the check and resumes the original request (store pending request in `pending_uploads` keyed by user_id + payload)

**Fix 3: "Error sending file" when sending from non-active bots**
Telegram `file_id`s are **bot-specific** — a file_id obtained by Bot A cannot be used by Bot B. That's why webpage-added bots fail.
Fix:
- When a movie is archived to STORAGE_CHANNEL, save `storage_chat_id + storage_message_id` (already done for new uploads)
- All bots send via `copyMessage(from_chat_id=storage_chat_id, message_id=storage_message_id)` — works for any bot that's admin in the storage channel
- For legacy rows still missing `storage_message_id`, fall back to old `file_id` only if the **same bot that uploaded it** is sending; otherwise show "this file needs re-archiving" and queue it
- Add per-row "Re-archive" button in admin/movies (uses active bot to fetch + repost into storage)
- Surface exact Telegram error in logs + admin UI

**Fix 4: "File not in our DB" leaking user-uploaded files**
Right now group-uploaded files are being returned to other searchers without being archived. I'll:
- Stop indexing uploads that aren't in STORAGE_CHANNEL — only `movies` rows with non-null `storage_message_id` are searchable
- Anything pending goes to `pending_uploads` and is archived first, then indexed

---

### Batch 2 — Finish admin panel

**Fix 5: Remaining admin pages**
- `/admin/settings` — STORAGE_CHANNEL_ID, backup channel, force-join list, auto-delete minutes, maintenance mode (all in `bot_settings`)
- `/admin/storage` — health check (bot is admin? channel reachable? count of archived vs legacy movies), "migrate legacy" button
- `/admin/requests` — list pending movie requests, mark fulfilled
- `/admin/logs` — error logs feed
- Remove placeholder buttons; every action wired to a real server fn

---

### Technical details

**DB migrations needed (Batch 1):**
- `delete_queue(id, bot_id, chat_id, message_id, delete_at, created_at)` + index on `delete_at`
- `pending_uploads` — already exists, will reuse
- `bot_settings` rows: `auto_delete_minutes`, `force_join_channels` (jsonb array), `storage_channel_id`, `backup_storage_channel_id`
- pg_cron job → `run-delete-queue`

**Code touch points:**
- `src/lib/telegram/storage.server.ts` — `copyMessage` for all sends, fallback logic
- `src/lib/telegram/bot.server.ts` — force-join middleware, auto-delete queue inserts
- `src/routes/api/public/hooks/run-delete-queue.ts` — new
- `src/lib/admin/admin.functions.ts` — settings CRUD, re-archive, requests
- `src/routes/_authenticated/admin.settings.tsx`, `admin.storage.tsx`, `admin.requests.tsx` — new pages

---

### Confirm before I start

Reply **"go batch 1"** and I'll ship fixes 1–4 in one turn, then verify before Batch 2. Or reply **"go all"** if you accept it may take 2 turns total.

If anything above is wrong (e.g. backup is a channel not a group, different auto-delete time, different force-join list), tell me now.