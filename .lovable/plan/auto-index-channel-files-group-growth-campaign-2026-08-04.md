# Auto-Index Channel Files + Group Growth Campaign

Do naye feature: (1) storage channel me file daalte hi movie khud DB me add ho jaye, (2) sabhi users ko main group me laane ka invite + reminder system — dono bot aur admin panel me.

## 1. Auto-Index New Channel Files

Abhi movie add karne ke liye admin ko bot ke DM me `/upload` ya `/fastupload` karna padta hai. Naya flow:

- Bot ab storage channel ke `channel_post` aur `edited_channel_post` sunega — sirf usi channel ka jo settings me `storage_channel_id` set hai.
- Har video/document post par file_id, file size, file kind, caption ya file name automatically padha jayega.
- Existing caption parser + size→quality rule (1MB–800MB = 480p, 801MB–1.3GB = 720p, 1.31GB–2.5GB = 1080p, usse upar 2160p) se title, year, language, quality auto-fill.
- TMDB verification wahi chalega jo normal upload me chalta hai (poster, tmdb_id, overview, aliases, search_text).
- Duplicate guard: same file_id pehle se hai to skip; same title+year+quality hai to us row ko update karega, naya row nahi banayega.
- `storage_chat_id` + `storage_message_id` save honge taaki delivery copy-forward se turant ho.
- Caption edit karne par usi row ki metadata refresh ho jayegi.
- Har indexed file ka admin ko short DM summary + activity log entry.
- Purane channel posts bot API se padhe nahi ja sakte, isliye sirf aage aane wale posts index honge; purani files ke liye manual upload rahega.

Admin panel: Storage page par "Auto-index" on/off toggle + last 20 auto-indexed files ki list (title, size, quality, time, TMDB verified).

## 2. Sabhi Users Ko Group Me Laana (Invite Campaign)

Telegram bot kisi user ko zabardasti group me add nahi kar sakta — sirf invite bhej sakta hai. Isliye "one-tap join campaign":

- Nayi table `group_membership`: per user main group / backup group / channel joined status, last checked, last reminded, reminder count.
- `chat_member` updates se join/leave real-time track hoga.
- Naya command `/inviteall` + admin panel button "Invite all to group": har user ko DM — poster-style message, ek tap "➕ Join Main Group" button aur "✅ Verify" button.
- Jinhone bot block kiya hai ya DM band hai, unka failed list + reason panel me dikhega.
- Daily cron sirf pending users ko remind karega — max 1 reminder per 24h, 3 reminders ke baad ruk jayega.
- Live report: total users / joined / pending / blocked / verification %.

Admin panel: Users page me naya "Growth" tab — counts, "not joined" filter, aur "Send invite now" / "Remind pending" buttons with result report.

## Technical Notes

- Auto-index logic alag file `src/lib/telegram/autoindex.server.ts` me; `bot.server.ts` me sirf `channel_post` / `edited_channel_post` / `chat_member` handlers aur `/inviteall` command.
- Webhook `allowed_updates` me `channel_post` + `edited_channel_post` add karke `syncBotWebhook` se sabhi bots ka webhook dobara set hoga.
- Migration: `movies` me `auto_indexed boolean default false` + unique index on `file_id`; nayi table `group_membership` (RLS service-role only + GRANTs, project pattern ke hisaab se).
- Naya hook route `src/routes/api/public/hooks/group-invite-reminders.ts` (HOOK_SECRET protected) + daily pg_cron schedule.
- Admin panel: `admin.storage.tsx` me auto-index panel, `admin.users.tsx` me growth tab, server fns `admin.functions.ts` me.
- Storage channel already auto-delete queue se excluded hai, to indexed posts delete nahi honge.