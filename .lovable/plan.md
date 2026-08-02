## 1. Auto-delete: har message delete ho (text, photo, video, document, admin ke bhi)

Abhi kya ho raha hai (verified in `src/lib/telegram/bot.server.ts`):
- Sirf `tempReply` (line 267) aur `tempPhoto` (line 283) se bheje messages queue hote hain.
- In dono me explicit gate hai: `if (!isAdmin(ctx.from?.id))` — yaani admin se related koi message delete hi nahi hota.
- Baaki ~60 jagah seedha `ctx.reply(...)` hai (commands, errors, /pending, /search, broadcast confirmations) aur file delivery `copyMessage` (line 113) — inme se koi bhi delete queue me nahi jaata.

Fix:
- `createBot()` me grammY **API transformer** lagana: bot jo bhi bheje (`sendMessage`, `sendPhoto`, `sendVideo`, `sendDocument`, `copyMessage`, `sendMediaGroup`, `sendAnimation`, `sendAudio`), response ka `message_id` automatically `delete_queue` me enqueue ho jaye. Isse har outgoing message cover hoga — koi call site chhutega nahi.
- Har incoming user/admin message bhi ek global middleware se enqueue ho (private chat + group dono), taaki user ka apna search text bhi 3 min baad hat jaye.
- Admin exemption hata dena (`isAdmin` gate `tempReply`/`tempPhoto` se remove) — user ne kaha admin ke messages bhi delete ho.
- Exclusions jo zaroori hain (warna bot toot jayega): storage channel me upload/copy kiye gaye files (wo permanent rehne chahiye, warna file_id dead ho jayegi), aur broadcast/promotion ke messages optional — inhe transformer me chat-id check se skip karenge.
- Timer: `bot_settings.autodelete_timer` (admin panel se 180s). Cron `run-delete-queue` pehle se har minute chalta hai; drain limit 200 se badha kar 500 karenge kyunki ab volume zyada hoga.

## 2. Search: sirf usi naam ki files dikhe

Abhi `searchMovies` → `smartSearch` (limit 50) me Tier-5 Fuse fuzzy ke results bhi shaamil ho jaate hain, isliye "War" search par War, Warrior, Warfare jaise alag movies mil jaati hain.

Fix (`src/lib/telegram/search.server.ts`):
- Do buckets banayenge: **strong** (exact title / normalized exact / alias exact / title starts-with ya contains full query) aur **weak** (sirf Fuse fuzzy).
- Agar strong bucket me ek bhi row hai → sirf strong rows return honge, aur unme se bhi sirf wahi jinka normalized title top match ke title ke barabar hai. Result: ek hi movie ke saare quality/language variants (jitni files DB me hain, sab) dikhengi, doosri movie ki entry nahi.
- Agar strong bucket khaali hai → tabhi fuzzy fallback (existing "similar mila" suggestion list) chalega, jaisa abhi hai.
- Pagination/`send_<id>` buttons aur bottom TMDB request button waise hi rahenge.

## Technical notes
- Files: `src/lib/telegram/bot.server.ts` (transformer + middleware + admin gate), `src/lib/telegram/search.server.ts` (title-locked filtering), `src/lib/telegram/delete-queue.server.ts` (bot_id pass karna), `src/routes/api/public/hooks/run-delete-queue.ts` (limit).
- Koi DB migration nahi chahiye — `delete_queue`, `bot_settings` aur cron pehle se maujood hain.
- Publish karna zaroori hai taaki live worker par naya behaviour chale.
