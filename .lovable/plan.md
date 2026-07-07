# Group me msg bhejne se pehle "Start + Join" gate

## Goal
Jab koi user bot ko DM me start kiye bina **group** me kuch bhi (movie name, command, callback) bhejta hai, bot uska message ignore karke ek chhoti reply bhejega jisme **ek button `▶️ Start & Join All`** hoga. Us button se:
1. User bot DM me pahunche + auto `/start` fire ho (deep-link se).
2. Sab admin-set groups (main + backup + force_join) join karne ke buttons DM me mile — har button ek click me Telegram ka Join dialog kholta hai.
3. Sab join hone ke baad hi user group me freely likh sakta hai.

## Kya check karenge
- **"Bot started" proof** = user telegram\_id `tg_users` table me maujood ho (already `trackUser()` sirf DM flows me call hota hai, so presence = started). Extra hardening: `bot.api.sendChatAction(uid, "typing")` try karke `403 Forbidden` catch — agar 403 aaya to user ne DM open nahi kiya.
- **Groups joined** = existing `missingChannels(bot, uid)` helper — already main+backup+force\_join sab check karta hai.

## Files (sirf ek file badlegi)
**`src/lib/telegram/bot.server.ts`**

### 1. Naye chhote helpers (mojooda `missingChannels` ke paas)
```ts
async function hasStartedBot(uid: number): Promise<boolean> {
  // DB check: tg_users row = user ne kabhi DM me interact kiya
  const { data } = await supabaseAdmin
    .from("tg_users").select("telegram_id").eq("telegram_id", uid).maybeSingle();
  if (!data) return false;
  // Live check: bot user ko DM bhej sakta hai?
  try { await bot.api.sendChatAction(uid, "typing"); return true; }
  catch { return false; }
}

function startAndJoinKb(): InlineKeyboard {
  return new InlineKeyboard()
    .url("▶️ Start & Join All", `https://t.me/${BOT_USERNAME()}?start=join`);
}
```
(helper ko `bot` handle chahiye, isliye `createBot()` ke andar closure me rakhenge — same pattern jaise `missingChannels`.)

### 2. Group DM helper — sab join buttons ek jagah
```ts
async function sendJoinAllInDm(uid: number) {
  const s = await getSettings();
  const kb = new InlineKeyboard();
  const links = [
    ["📢 Main Group", asHttpsLink(s.main_group_link || s.force_join_link)],
    ["🗂️ Backup Group", asHttpsLink(s.backup_group_link)],
  ].filter(([, u]) => !!u) as [string, string][];
  for (const [label, url] of links) kb.url(label, url).row();
  kb.text("✅ Sab Join Kar Li — Verify", "verify_join");
  await bot.api.sendMessage(uid,
    `🎬 *Welcome CineRadar!*\n\n` +
    `Bot use karne se pehle neeche diye sab groups join karo, phir *Verify* dabaao. Verify hone ke baad group me movie name likh ke turant reply milega.`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
}
```

### 3. Group middleware gate (line 657-658 replace)
Abhi wahan hai:
```ts
if (chatType && chatType !== "private") return next();
```
Iski jagah:
```ts
if (chatType && chatType !== "private") {
  // Group me: pehle bot start + sab groups joined check karo
  const started = await hasStartedBot(uid);
  const missing = started ? await missingChannels(bot, uid) : ["*"];
  if (started && missing.length === 0) return next();

  // Silently user ka original msg auto-delete (spam na ho) + ek chhoti reply
  const reason = !started ? "Pehle bot ko DM me *Start* karo." : "Pehle sab groups join karo.";
  const reply = await ctx.reply(
    `⚠️ @${ctx.from?.username ?? ctx.from?.first_name ?? "user"}, ${reason}\n` +
    `Neeche button dabaao — ek click me sab ho jayega.`,
    { parse_mode: "Markdown", reply_markup: startAndJoinKb() }
  ).catch(() => null);
  // Auto-cleanup (mojooda scheduleDelete use karke)
  if (reply && ctx.chat?.id) await scheduleDelete(ctx.api, ctx.chat.id, reply.message_id, ctx.message?.message_id ?? 0);
  return; // next() NAHI — user ka msg process nahi hoga
}
```

### 4. `/start` deep-link `join` handle (line ~719 ke paas, `fromGroup` branch se pehle)
```ts
if (startParam === "join") {
  await trackUser(uid, ctx.from?.first_name, ctx.from?.username);
  await sendJoinAllInDm(uid);
  return;
}
```
Isse `t.me/BOT?start=join` tap karne par:
- Telegram DM khulta hai + user `Start` dabata hai
- `trackUser` = "started" mark
- DM me sab group join buttons + Verify aata hai

### 5. `verify_join` callback (line 638-655) me chhota tweak
Verify success hone par extra line add: *"Ab aap group me movie name bhej sakte ho — turant reply milega."* Baaki flow same.

## Kya NAHI badlega
- DB schema, migrations, RLS — kuch nahi (existing `tg_users` presence enough).
- Admin panel / `/setmaingroup` / `/setbackupgroup` — same.
- DM flow (private chat) — same, wahan pehle se force-join gate laga hua hai.
- Sirf admins ko exempt: `isAdmin(uid)` check middleware me pehle se hai (line 632), so admins bina start/join group me kaam kar sakte hain.

## Ek-click UX
Telegram bot API groups me user ko auto-join nahi kara sakti (Telegram restriction). "Ek click" ka matlab: ek button → Telegram ka native Join dialog → user "Join" tap kare. Ye already sabse chhota flow hai. Start bhi ek tap (`?start=join` deep-link ek hi tap me DM khol ke Start button dikhata hai).

## Verify
1. Naya test user se group me "abcd" bhejo → bot delete kare + "Start & Join All" button wali reply de.
2. Button tap → DM khule → Start dabao → sab group buttons + Verify aaye.
3. Groups join karke Verify dabao → "Verified" msg + ab group me "War 2019" likhne par normal search reply.
4. Admin user ke saath test → koi gate nahi (pehle jaisa).
