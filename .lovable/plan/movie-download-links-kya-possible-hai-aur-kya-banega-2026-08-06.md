# Movie Download Links — kya possible hai aur kya banega

## Pehle honest technical baat (20MB limit)

Bot ke paas file sirf `file_id` ke roop me hai — asli file Telegram ke server par hai.
Kisi bhi file ka HTTP link banane ke liye bot ko pehle file **download** karni padegi
(`getFile` + download). Telegram ka Bot API is download ko **20MB** par hard-cap karta hai.
Ye hamare code ki limit nahi, Telegram ki taraf se hai — koi middleware, proxy ya stream
trick isse bypass nahi kar sakti, kyunki bade file ka download URL Telegram bot ko deta hi nahi.

Iske sirf 2 real bypass hain, dono is app par chal nahi sakte:

1. **Self-hosted Telegram Bot API server** (limit 2GB ho jati hai) — iske liye apna Linux
   VPS + docker chahiye. Ye app Cloudflare Worker par chalta hai, wahan aisa server host
   nahi ho sakta.
2. **MTProto user-account client** (gramjs/telethon) — raw TCP socket chahiye, jo Worker
   runtime me available nahi.

Dono me file ko kahin re-host bhi karna padega (2GB x 300 files = bhaari storage cost),
isliye recommend nahi kar raha.

## To phir kya banega (ye har file size par 100% chalega)

Har movie ka ek **public web page + short link**, jise WhatsApp/Insta/kahin bhi share kiya
ja sake. Page browser me khulta hai, download Telegram ke through instant hota hai
(Telegram khud unlimited size deta hai).

```text
https://<app>/m/<id>
   |-- Poster, title, year, language, quality, file size, overview (DB se)
   |-- [ Download Now ]  -> t.me/<bot>?start=dl_<id>   (file turant DM me)
   |-- [ Backup Group ]
   +-- Same title ke dusre quality/language options
```

Access: **open link** — koi force-join gate nahi (jaisa aapne choose kiya).
`/start dl_<id>` bina join-check ke file bhej dega.

## Kya-kya add hoga

1. **Public route `/m/$id`** — SSR page, DB se details, poster, SEO meta + og:image
   (link paste karte hi WhatsApp par poster preview aayega).
2. **`/movies` index page** — search + pagination, saari movies browse.
3. **Bot side**: `dl_<id>` deep-link handler jo direct file bheje, aur har search result /
   delivery message me ek **Web Link** button uske share-able URL ke sath.
4. **`/link <id>` admin command** — turant share-able URL de.
5. **Bonus: asli direct download ≤20MB files par** — jin files ka size 20MB se kam hai
   (trailers, samples), unke page par `Direct Download` button browser me hi stream karega.
   Bade file par ye button automatically hide rahega.

## Technical details

- `src/routes/m.$id.tsx` — public leaf route; loader naye public server fn `getPublicMovie`
  se data leta hai (sirf safe columns: title, year, language, quality, file_size,
  poster_url, overview, tmdb_id — `file_id` kabhi client par nahi jaata).
- `src/routes/movies.tsx` — listing + query-param search, server fn `listPublicMovies`.
- `src/lib/public-movies.functions.ts` — dono server fns; `supabaseAdmin` handler ke andar
  dynamic import se.
- `src/routes/api/public/dl/$id.ts` — sirf ≤20MB: `getFile` -> Telegram CDN fetch ->
  `Content-Disposition: attachment` stream. Bade file par Telegram link par redirect.
- `bot.server.ts`: `dl_<id>` start-payload branch (existing `join`/payload branches ke
  bagal me), `webUrl(movie)` helper, delivery keyboard me `Web Link` button, `/link` command.
- Base URL published host se; `bot_settings` me `public_site_url` key taaki baad me custom
  domain set kiya ja sake.
- Koi schema change nahi chahiye — `poster_url`, `file_size`, `overview` pehle se DB me hain.