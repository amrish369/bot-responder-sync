# Har file ke sath Backup Group button

## Kya karna hai
Jab bhi bot user ko movie file bhejta hai, uske niche ek `🗂️ Backup Group` URL button lagega. Link `bot_settings.backup_group_link` se aayega (admin `/setbackupgroup` se set karta hai). Agar setting empty ho, button hide (koi tootha button nahi).

## Files
**`src/lib/telegram/bot.server.ts`** — sirf yehi file badlegi.

1. Naya helper add karo (mojooda `linksRow()` / `channelKeyboard()` ke paas):
   ```ts
   async function backupGroupKb(): Promise<InlineKeyboard | null> {
     const s = await getSettings();
     const url = asHttpsLink(s.backup_group_link);
     if (!url) return null;
     return new InlineKeyboard().url("🗂️ Backup Group", url);
   }
   ```

2. `sendMovieFile()` ke har call site par backup button ko `opts.reply_markup` me merge karo (existing `mergeKeyboards` helper use karke):
   - line ~559 (request fulfil DM)
   - line ~695 (search result DM)
   - line ~1836, ~1853 (deep-link / callback file delivery)
   - line ~2000 (request approve delivery)
   - **skip** line ~2020 — yeh storage channel upload hai, waha button nahi chahiye.

   Pattern:
   ```ts
   const backup = await backupGroupKb();
   const finalKb = backup ? (kb ? mergeKeyboards(kb, backup) : backup) : kb;
   await sendMovieFile(ctx.api, uid, m, { caption, parse_mode: "Markdown", reply_markup: finalKb });
   ```
   Jin call sites me abhi `reply_markup` nahi hai (559, 695, 2000), waha bhi `reply_markup: backup ?? undefined` add ho jayega.

## Kya nahi badlega
- DB schema, RLS, migrations — kuch nahi.
- Admin panel / `/setbackupgroup` command — pehle se kaam kar raha hai.
- Storage channel upload flow.
- Caption text — sirf button add ho raha hai, caption same rahega.

## Verify
Build ke baad ek movie file bhej ke dekhna: caption ke niche `🗂️ Backup Group` button dikhna chahiye jo backup group ke link par le jaye.
