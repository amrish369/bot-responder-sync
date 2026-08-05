# Force Join Fix — Ek Hi Membership Check Sab Jagah

Abhi do alag systems chal rahe hain: bot ka live `getChatMember` check, aur naya `group_membership` table jo sirf `chat_member` updates se bharta hai. Purane users us table me hain hi nahi, isliye invite/remind unhe "pending" maan kar msg bhej deta hai — jabki wo pehle se joined hain.

## Kya theek hoga

1. **Ek hi membership source**
   - Ek helper: user ka status = bot started + main group joined + backup group joined (teeno).
   - Har check live Telegram se hota hai (`getChatMember`) aur result `group_membership` me cache ho jata hai (5–10 min TTL), taaki table hamesha sach bole.
   - `chat_member` real-time updates bhi wahi table update karte rahenge.

2. **Joined users ko dobara msg nahi**
   - Invite campaign aur daily reminder bhejne se pehle har user ka live check hoga; joined hai to skip (aur table update).
   - Jo bot start kar chuke + dono group me hain, unke liye campaign se koi DM nahi jayega.

3. **File tabhi mile jab teeno complete ho**
   - Delivery (search result, "Get Movie" button, deep-link `get_`, request auto-delivery) se pehle wahi teen-shart wala gate lagega.
   - Adhoora hone par ek hi clean message: kaun sa step baaki hai + ek-tap Start / Main Group / Backup Group buttons + Verify.
   - Verify button bhi teeno shart par pass hoga, warna kaunsa step baaki hai wo alert me batayega.

4. **Galat "join karo" se bachav**
   - Agar bot kisi group/channel me admin nahi hai to `getChatMember` fail hota hai — us case me user ko block nahi karenge (aaj bhi aisa hi hai), aur admin panel me warning dikhegi ki bot ko us group me admin banao warna verification reliable nahi.
   - Private invite link (`t.me/+...`) verify nahi ho sakti — settings me aisi link par panel me saaf warning.

5. **Admin panel**
   - Users → Growth tab me counts ab live-verified data se: started / main / backup / fully verified / pending.
   - "Remind pending" sirf sach me pending logon ko jayega.

## Technical Notes

- Naya `src/lib/telegram/membership.server.ts`: `getUserGateStatus(bot, userId, { fresh })` → `{ started, main, backup, ok, missing[] }`, `group_membership` me cache + `last_checked` TTL.
- `bot.server.ts`: `missingChannels` / `isChannelMember` / `hasStartedBot` ko is helper par shift; group gate, `verify_join`, aur sabhi delivery paths ek hi gate function use karenge.
- `growth.server.ts`: `runInviteCampaign` bhejne se pehle per-user `getUserGateStatus(..., { fresh: true })`, joined → skip; `growthStats` aur `listPendingMembers` bhi refreshed data par.
- `main_group_link` / `backup_group_link` settings me jo set hai wahi use hoga, koi hardcode nahi.
- Rate limit safe: campaign me per-user check ke saath 40ms throttle, aur TTL ke andar cached status dobara API call nahi karega.