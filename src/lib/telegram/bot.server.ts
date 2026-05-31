import { Bot, InlineKeyboard, type Context } from "grammy";
import Fuse from "fuse.js";
import {
  BOT_TOKEN,
  BOT_USERNAME,
  CHANNEL,
  CHANNEL_USERNAME,
  BACKUP_CHANNEL,
  BACKUP_CHANNEL_USERNAME,
  INSTAGRAM_URL,
  WEBSITE_URL,
  ADMIN_IDS,
  PRIMARY_ADMIN,
  isAdmin,
} from "./config.server";
import { MOOD_MAP, detectMood } from "./mood";
import {
  getIndianMoviesByType,
  tmdbSearchByTitle,
  tmdbSearchMultiple,
} from "./tmdb.server";
import {
  banUser,
  clearPendingUpload,
  deleteMovie,
  endConvo,
  fetchAllMovies,
  fetchMovieById,
  findPendingRequest,
  fulfillRequest,
  getActiveConvo,
  getPayload,
  getPendingUpload,
  getUser,
  getUserRequests,
  insertMovie,
  insertRequest,
  isBanned,
  listAllUsers,
  listPendingRequests,
  logChat,
  setConvo,
  setPendingUpload,
  storePayload,
  trackUser,
  unbanUser,
  updateMovie,
  userDisplayName,
  type MovieRow,
} from "./db.server";

// ─── FIX 1: 5-minute auto-delete (defined locally, not imported) ─────────────
const AUTO_DELETE_MS = 5 * 60 * 1000; // 5 minutes

// ─── helpers ────────────────────────────────────────────────
function sanitize(s: string | undefined): string {
  if (typeof s !== "string") return "";
  return s.replace(/[<>]/g, "").trim().slice(0, 200);
}
function escapeMarkdown(t: string | undefined): string {
  if (typeof t !== "string") return "";
  return t.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}
function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

// Auto-detect quality bucket from file size in bytes.
// 1MB–800MB → 480p · 801MB–1.3GB → 720p · 1.31GB–2.5GB → 1080p · >2.5GB → 4K
function qualityFromSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return null;
  if (mb <= 800) return "480p";
  if (mb <= 1331) return "720p";
  if (mb <= 2560) return "1080p";
  return "4K";
}

function fileKindFromMessage(msg: any): "video" | "document" {
  return msg?.document ? "document" : "video";
}

async function sendMovieFile(api: any, chatId: number | string, movie: MovieRow, opts: any) {
  if (movie.file_kind === "document") {
    return api.sendDocument(chatId, movie.file_id, opts);
  }
  return api.sendVideo(chatId, movie.file_id, opts);
}

const QUALITY_TOKENS = ["2160p","1440p","1080p","720p","540p","480p","360p","4K","UHD","HDR","HD","SD"];
function parseCaption(raw: string): { name: string; year: number | null; language: string | null; quality: string | null } {
  const original = (raw || "").replace(/[\r\n]+/g, " ").trim();
  if (!original) return { name: "", year: null, language: null, quality: null };
  let s = original;
  const yearM = s.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearM ? Number(yearM[0]) : null;
  if (yearM) s = s.replace(yearM[0], " ");
  let quality: string | null = null;
  for (const q of QUALITY_TOKENS) {
    const re = new RegExp(`\\b${q}\\b`, "i");
    if (re.test(s)) {
      const low = q.toLowerCase();
      quality = low === "4k" || low === "uhd" ? "4K" : low === "hdr" ? "HDR" : q.toLowerCase();
      s = s.replace(re, " ");
      break;
    }
  }
  let language: string | null = null;
  const sortedLangs = [...KNOWN_LANGUAGES].sort((a, b) => b.length - a.length);
  for (const lang of sortedLangs) {
    const re = new RegExp(`\\b${lang}\\b`, "i");
    if (re.test(s)) {
      language = lang.charAt(0).toUpperCase() + lang.slice(1);
      s = s.replace(re, " ");
      break;
    }
  }
  const name = s.replace(/[._\-\[\]\(\)]+/g, " ").replace(/\s+/g, " ").trim();
  return { name, year, language, quality };
}
function movieBtnLabel(m: MovieRow): string {
  const parts: (string | number)[] = [m.title];
  if (m.year) parts.push(m.year);
  parts.push("|");
  parts.push(m.language || "N/A");
  parts.push("|");
  parts.push(m.quality || "N/A");
  return `⬇️ ${parts.join(" ")}`.slice(0, 60);
}

function scheduleDelete(api: any, chatId: number, ...msgIds: number[]) {
  setTimeout(() => {
    msgIds.forEach((id) => {
      if (id) api.deleteMessage(chatId, id).catch(() => {});
    });
  }, AUTO_DELETE_MS);
}

async function tempReply(ctx: Context, text: string, opts: any = {}) {
  const isA = isAdmin(ctx.from?.id);
  const msg = await ctx.reply(text, opts).catch(() => null);
  if (!isA && msg && ctx.chat?.id && ctx.chat?.type === "private") {
    scheduleDelete(ctx.api, ctx.chat.id, msg.message_id, ctx.message?.message_id ?? 0);
  }
  return msg;
}
async function tempPhoto(ctx: Context, photo: string, opts: any = {}) {
  const isA = isAdmin(ctx.from?.id);
  const msg = await ctx.replyWithPhoto(photo, opts).catch(() => null);
  if (!isA && msg && ctx.chat?.id && ctx.chat?.type === "private") {
    scheduleDelete(ctx.api, ctx.chat.id, msg.message_id, ctx.message?.message_id ?? 0);
  }
  return msg;
}

// ── DB search ──
function searchMovies(list: MovieRow[], query: string, filters: any = {}): MovieRow[] {
  const q = query.toLowerCase();
  return list.filter((m) => {
    if (!m.title.toLowerCase().includes(q)) return false;
    if (filters.language && (m.language || "").toLowerCase() !== filters.language.toLowerCase()) return false;
    if (filters.quality && (m.quality || "").toLowerCase() !== filters.quality.toLowerCase()) return false;
    if (filters.year && String(m.year) !== String(filters.year)) return false;
    return true;
  });
}

function cleanName(str: string): string {
  return str.replace(/[^a-zA-Z0-9\s]/g, "").toLowerCase().trim();
}
function fuzzyMatchMultiple(list: MovieRow[], query: string, limit = 5): MovieRow[] {
  const fuse = new Fuse(list, {
    keys: [
      { name: "title", weight: 0.5 },
      { name: "year", weight: 0.2 },
      { name: "language", weight: 0.1 },
      { name: "clean", weight: 0.2, getFn: (m: any) => cleanName((m as MovieRow).title) },
    ],
    threshold: 0.5,
    minMatchCharLength: 3,
    ignoreLocation: true,
    includeScore: true,
  });
  return fuse.search(query).filter((r) => (r.score ?? 1) <= 0.6).slice(0, limit).map((r) => r.item);
}

const KNOWN_LANGUAGES = ["hindi","english","tamil","telugu","malayalam","kannada","dual audio","multi audio","punjabi","bengali","marathi"];
function parseQuery(raw: string) {
  const query = raw.toLowerCase().trim();
  const yearMatch = query.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? yearMatch[0] : null;
  let namePart = query.replace(/\b(19\d{2}|20\d{2})\b/, "").trim();
  let language: string | null = null;
  const sortedLangs = [...KNOWN_LANGUAGES].sort((a, b) => b.length - a.length);
  for (const lang of sortedLangs) {
    const regex = new RegExp(`\\b${lang}\\b`, "i");
    if (regex.test(namePart)) {
      language = lang.charAt(0).toUpperCase() + lang.slice(1);
      namePart = namePart.replace(regex, "").trim();
      break;
    }
  }
  let movieName = namePart.replace(/\s+/g, " ").trim();
  if (!movieName) movieName = query;
  return { movieName, year, language };
}

function buildFilterKeyboard(query: string, results: MovieRow[]): InlineKeyboard {
  const years = [...new Set(results.map((m) => m.year).filter(Boolean))].sort().reverse();
  const langs = [...new Set(results.map((m) => m.language).filter(Boolean))].sort();
  const quals = [...new Set(results.map((m) => m.quality).filter(Boolean))].sort();
  const kb = new InlineKeyboard();
  if (years.length > 1) { years.slice(0, 5).forEach((y) => kb.text(`📅 ${y}`, `f|${query}|year|${y}`)); kb.row(); }
  if (langs.length > 1) { langs.slice(0, 4).forEach((l) => kb.text(`🌐 ${l}`, `f|${query}|lang|${l}`)); kb.row(); }
  if (quals.length > 1) { quals.slice(0, 5).forEach((q) => kb.text(`📺 ${q}`, `f|${query}|qual|${q}`)); kb.row(); }
  if (years.length > 1 || langs.length > 1 || quals.length > 1) {
    kb.text(`🔄 All (${results.length})`, `f|${query}|all|all`);
  }
  return kb;
}
function mergeKeyboards(kb1: InlineKeyboard, kb2: InlineKeyboard): InlineKeyboard {
  const merged = new InlineKeyboard();
  const rows1 = (kb1 as any).inline_keyboard || [];
  const rows2 = (kb2 as any).inline_keyboard || [];
  [...rows1, ...rows2].forEach((row: any[]) => { if (row.length) merged.row(...row); });
  return merged;
}

// ── force join ──
async function isChannelMember(bot: Bot, userId: number): Promise<boolean> {
  const checks = [CHANNEL(), BACKUP_CHANNEL()];
  let errors = 0;
  for (const ch of checks) {
    try {
      const m = await bot.api.getChatMember(ch, userId);
      if (["member", "administrator", "creator"].includes(m.status)) return true;
    } catch { errors++; }
  }
  if (errors === checks.length) return true;
  return false;
}
async function sendForceJoinMsg(ctx: Context) {
  const kb = new InlineKeyboard()
    .url("📢 Main Group Join Karein", `https://t.me/${CHANNEL_USERNAME()}`)
    .row()
    .url("🗂️ Backup Group Join Karein", `https://t.me/${BACKUP_CHANNEL_USERNAME()}`)
    .row()
    .text("✅ Join Kar Li — Verify", "verify_join");
  await ctx.reply(
    `🔒 *Bot Use Karne Ke Liye Pehle Group Join Karein!*\n\n` +
    `📢 Main Group: @${CHANNEL_USERNAME()}\n` +
    `🗂️ Backup Group: @${BACKUP_CHANNEL_USERNAME()}\n\n` +
    `Koi ek group join karke *"✅ Join Kar Li — Verify"* button dabaao.`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch(() => {});
}

// ─── FIX 2: finishUpload — extracted and hardened ────────────────────────────
// Now accepts an explicit adminId so it works correctly from both
// message-handler and callback-handler contexts.
async function finishUpload(ctx: Context, pend: any, adminId: number) {
  // Validate required fields before attempting DB insert
  if (!pend.name || !pend.name.trim()) {
    await clearPendingUpload(adminId);
    return ctx.reply("❌ Movie name missing. Upload kancelled karein aur dobara try karein.");
  }
  if (!pend.file_id) {
    await clearPendingUpload(adminId);
    return ctx.reply("❌ File ID missing. Pehle video/file bhejein.");
  }

  // Safely parse year
  const yearNum = pend.year ? Number(String(pend.year).trim()) : null;

  // Auto-detect quality from size if missing
  const finalQuality = pend.quality || qualityFromSize(pend.file_size) || null;

  const { movie: inserted, error: insErr } = await insertMovie({
    title: pend.name.trim(),
    file_id: pend.file_id,
    file_kind: pend.file_kind === "document" ? "document" : "video",
    year: yearNum && Number.isFinite(yearNum) ? yearNum : null,
    language: pend.language ?? null,
    quality: finalQuality,
    type: null,
    added_by: adminId,
    file_size: pend.file_size ?? null,
  });
  await clearPendingUpload(adminId);

  if (!inserted) {
    return ctx.reply(
      `❌ Movie save nahi hui.\n\nReason: \`${insErr || "unknown"}\`\n\nDobara /edit <id> se retry karein.`,
      { parse_mode: "Markdown" }
    );
  }

  const sizeLabel = fmtSize(pend.file_size);
  const caption =
    `✅ *Movie Saved!*\n\n` +
    `🎬 ${escapeMarkdown(pend.name)} (${yearNum || "?"})\n` +
    `🌐 ${pend.language || "N/A"} | 📺 ${finalQuality || "N/A"}` +
    (sizeLabel ? ` | 💾 ${sizeLabel}` : "") + `\n` +
    `🆔 ID: \`${inserted.id}\``;
  const kb = new InlineKeyboard()
    .text("📢 Post to Channel", `post_to_channel_${inserted.id}`)
    .text("❌ No", "dismiss_post");
  const reply = await ctx.reply(caption, { parse_mode: "Markdown", reply_markup: kb });

  // ── Auto-deliver to users with matching pending requests (fuzzy) ──
  try {
    const pending = await listPendingRequests();
    const fuse = new Fuse(pending, {
      keys: ["title"],
      threshold: 0.45,
      ignoreLocation: true,
      minMatchCharLength: 3,
    });
    const matched = fuse.search(inserted.title).map((r) => r.item);
    let delivered = 0;
    const seen = new Set<number>();
    for (const req of matched) {
      if (seen.has(req.user_id)) continue;
      seen.add(req.user_id);
      try {
        const dmKb = new InlineKeyboard()
          .url("⚡ 3x Fast Download — Website Visit Karein", WEBSITE_URL).row()
          .url("📷 Instagram (Optional)", INSTAGRAM_URL);
        await sendMovieFile(ctx.api, req.user_id, inserted, {
          caption:
            `🎉 *Aapki Requested Movie Ready Hai!*\n\n` +
            `🎬 *${escapeMarkdown(inserted.title)}* (${inserted.year || "?"})\n` +
            `🌐 ${inserted.language || "N/A"} | 📺 ${inserted.quality || "N/A"}` +
            (sizeLabel ? ` | 💾 ${sizeLabel}` : "") + `\n\n` +
            `📩 Aapne request kiya tha: _${escapeMarkdown(req.title)}_`,
          parse_mode: "Markdown",
          reply_markup: dmKb,
        });
        await fulfillRequest(req.id);
        delivered++;
      } catch (e) {
        console.error("[auto-deliver]", req.user_id, (e as Error).message);
      }
    }
    if (delivered > 0) {
      await ctx.reply(`📨 Auto-delivered to ${delivered} requesting user(s).`).catch(() => {});
    }
  } catch (e) {
    console.error("[auto-deliver scan]", (e as Error).message);
  }
  return reply;
}

// ── bot factory ──
export function createBot(): Bot {
  const bot = new Bot(BOT_TOKEN());

  // chat_join_request: auto-approve
  bot.on("chat_join_request", async (ctx) => {
    try {
      await ctx.approveChatJoinRequest(ctx.from.id);
      await bot.api.sendMessage(ctx.from.id,
        `🎉 *Welcome to CineRadar AI!*\n\n` +
        `✅ Aapki join request accept ho gayi!\n\n` +
        `🎬 Ab aap bot use kar sakte hain:\n` +
        `• Movie ka naam type karo\n` +
        `• /random — random movie\n` +
        `• /debate — live voting\n` +
        `• Mood type karo: happy, sad, action...\n\n` +
        `⚡ *3x Fast Download ke liye website visit karein ek baar!*\n` +
        `🔗 ${WEBSITE_URL}`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    } catch (e) { console.error("[JOIN REQUEST]", (e as Error).message); }
  });

  // ban check + force join middleware
  bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (!uid) return next();
    if (await isBanned(uid)) {
      await ctx.reply("🚫 You are banned.").catch(() => {});
      return;
    }
    if (isAdmin(uid)) return next();

    if (ctx.callbackQuery?.data === "verify_join") {
      const joined = await isChannelMember(bot, uid);
      if (joined) {
        await trackUser(uid, ctx.from?.first_name, ctx.from?.username);
        try { await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }); } catch {}
        await ctx.reply(
          `✅ *Verification Successful!*\n\n` +
          `🎬 Ab aap CineRadar AI use kar sakte hain!\n` +
          `Movie ka naam type karo ya /help dekho.`,
          { parse_mode: "Markdown" }
        ).catch(() => {});
        return ctx.answerCallbackQuery({ text: "✅ Verified! Bot use kar sakte hain." });
      }
      return ctx.answerCallbackQuery({
        text: "❌ Aap abhi channel member nahi hain. Pehle join karein!",
        show_alert: true,
      });
    }

    const chatType = ctx.chat?.type || ctx.callbackQuery?.message?.chat?.type;
    if (chatType && chatType !== "private") return next();

    const joined = await isChannelMember(bot, uid);
    if (!joined) {
      if (ctx.callbackQuery) {
        await sendForceJoinMsg(ctx).catch(() => {});
        return ctx.answerCallbackQuery({ text: "⚠️ Pehle channel join karein!", show_alert: true });
      }
      return sendForceJoinMsg(ctx);
    }
    return next();
  });

  // ─── COMMANDS ───

  bot.command("start", async (ctx) => {
    const uid = ctx.from!.id;
    const chatType = ctx.chat?.type;
    await trackUser(uid, ctx.from?.first_name, ctx.from?.username);
    if (chatType !== "private") {
      const kb = new InlineKeyboard()
        .url("🤖 Bot DM Mein Start Karein", `https://t.me/${BOT_USERNAME()}?start=from_group`);
      return ctx.reply(
        `Bot ko DM mein start karein taaki movies download kar sakein aur updates milein.`,
        { reply_markup: kb }
      ).catch(() => {});
    }
    const firstName = ctx.from?.first_name || "User";
    const startParam = ctx.match as string;
    const fromGroup = startParam?.includes("from_group") || startParam?.includes("ref");
    if (fromGroup) {
      return ctx.reply(
        `✅ *Bot Start Ho Gaya, ${escapeMarkdown(firstName)}!*\n\n` +
        `Ab aapko milega:\n` +
        `📢 Daily movie updates\n` +
        `📩 Download notifications\n` +
        `🗳️ Debate results\n` +
        `🎬 Direct movie DMs\n\n` +
        `👇 *Ab kya karo?*\n` +
        `Movie ka naam type karo ya /help dekho.`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    }
    return ctx.reply(
      `🎬 *Welcome to CineRadar AI, ${escapeMarkdown(firstName)}!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🔍 *Movie Dhundho*\n` +
      `Movie ka naam type karo (min 3 letters)\n\n` +
      `🎭 *Mood Se Dhundho*\n` +
      `happy • sad • romantic • scary\n` +
      `funny • action • chill • mystery\n` +
      `Ya emoji bhejo: 😄 😢 ❤️ 😱 😂 💥\n\n` +
      `🎲 /random — Random movie\n` +
      `🆕 /new — Nayi releases\n` +
      `🔮 /upcoming — Aane wali movies\n` +
      `📋 /myrequests — Apni requests\n` +
      `❓ /help — Poori guide\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `⏱️ _Messages 5 min mein delete hote hain — forward karke save karo_\n` +
      `⚡ _3x Fast Download ke liye website visit karein ek baar_`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("help", async (ctx) => {
    const helpText =
      `🎬 *CineRadar AI — Commands*\n\n` +
      `🔍 *Search:* Just type movie name (min 3 chars)\n` +
      `📺 *Filters:* Year / Language / Quality buttons appear after search\n` +
      `📩 *Request:* Button appears if movie not found\n\n` +
      `🎭 *Mood Search:* Type your mood and get instant suggestion!\n` +
      `   happy • sad • romantic • scary • funny • action • chill • mystery\n` +
      `   Ya emoji bhejo: 😄 😢 ❤️ 😱 😂 💥 😌 🔍\n\n` +
      `🎲 /random — Database se random movie\n` +
      `   Ya sirf "random" type karo\n\n` +
      `🆕 /new — New Bollywood & South Indian releases\n` +
      `🔮 /upcoming — Upcoming Indian movies\n` +
      `📋 /myrequests — Track your requests\n\n` +
      `⚡ *3x Fast Download:* Website par ek baar visit karein\n\n` +
      `👑 *Admin only:* /edit, /stats, /broadcast, /promote, /delete, /ban, /unban\n` +
      `               /pending, /search, /dm, /reply <reqId> <msg>\n` +
      `               /convo, /endconvo, /fastupload`;
    await tempReply(ctx, helpText, { parse_mode: "Markdown" });
  });

  bot.command("new", async (ctx) => {
    const loading = await ctx.reply(`🔄 TMDB se nayi Indian releases dhundh raha hoon...`);
    try {
      const list = await getIndianMoviesByType("new", 5);
      await ctx.api.deleteMessage(ctx.chat!.id, loading.message_id).catch(() => {});
      if (!list.length) return tempReply(ctx, "❌ No new Indian movies found.");
      const allMovies = await fetchAllMovies();
      for (const m of list) {
        const relDate = m._releaseDate && m._releaseDate !== "upcoming" ? `📅 Release: ${m._releaseDate}\n` : "";
        const langLine = m._language && m._language !== "N/A" ? `🌐 ${escapeMarkdown(m._language)}\n` : "";
        const caption =
          `🆕 *${escapeMarkdown(m.Title)}* (${m.Year})\n` +
          relDate + langLine +
          (m.imdbRating !== "N/A" ? `⭐ IMDb: ${m.imdbRating}/10\n` : "") +
          (m.Plot !== "N/A" ? `\n📖 ${escapeMarkdown(m.Plot.slice(0, 200))}\n` : "") +
          `\n⚡ *3x Fast Download ke liye website par ek baar visit karein!*`;
        const isUploaded = searchMovies(allMovies, m.Title).length > 0;
        const kb = new InlineKeyboard();
        if (!isUploaded) {
          const key = await storePayload({ title: m.Title, year: m.Year, language: m._language });
          kb.text(`📩 Request: ${m.Title} (${m.Year})`, `req_confirm_${key}`).row();
        }
        kb.url("⚡ 3x Fast Download ke liye Website Visit Karein", WEBSITE_URL).row()
          .url("📷 Instagram (Optional)", INSTAGRAM_URL);
        await tempPhoto(ctx, m.Poster, { caption, parse_mode: "Markdown", reply_markup: kb });
      }
    } catch (e) {
      console.error("[/new]", (e as Error).message);
      await tempReply(ctx, "❌ Error fetching new movies. Thodi der baad try karo.");
    }
  });

  bot.command("upcoming", async (ctx) => {
    const loading = await ctx.reply(`🔄 TMDB se upcoming Indian movies dhundh raha hoon...`);
    try {
      const list = await getIndianMoviesByType("upcoming", 5);
      await ctx.api.deleteMessage(ctx.chat!.id, loading.message_id).catch(() => {});
      if (!list.length) return tempReply(ctx, "❌ No upcoming Indian movies found.");
      const allMovies = await fetchAllMovies();
      for (const m of list) {
        const relDate = m._releaseDate ? `📅 Release Date: *${escapeMarkdown(m._releaseDate)}*\n` : `📅 Coming Soon\n`;
        const langLine = m._language !== "N/A" ? `🌐 ${escapeMarkdown(m._language)}\n` : "";
        const caption =
          `🔮 *${escapeMarkdown(m.Title)}* (${m.Year})\n` +
          relDate + langLine +
          (m.imdbRating !== "N/A" ? `⭐ IMDb: ${m.imdbRating}/10\n` : "") +
          (m.Plot !== "N/A" ? `\n📖 ${escapeMarkdown(m.Plot.slice(0, 200))}\n` : "") +
          `\n⚡ *3x Fast Download ke liye website par ek baar visit karein!*`;
        const isUploaded = searchMovies(allMovies, m.Title).length > 0;
        const kb = new InlineKeyboard();
        if (!isUploaded) {
          const key = await storePayload({ title: m.Title, year: m.Year, language: m._language });
          kb.text(`📩 Request: ${m.Title} (${m.Year})`, `req_confirm_${key}`).row();
        }
        kb.url("⚡ 3x Fast Download ke liye Website Visit Karein", WEBSITE_URL).row()
          .url("📷 Instagram (Optional)", INSTAGRAM_URL);
        await tempPhoto(ctx, m.Poster, { caption, parse_mode: "Markdown", reply_markup: kb });
      }
    } catch (e) {
      console.error("[/upcoming]", (e as Error).message);
      await tempReply(ctx, "❌ Error fetching upcoming movies. Thodi der baad try karo.");
    }
  });

  bot.command("myrequests", async (ctx) => {
    const reqs = await getUserRequests(ctx.from!.id);
    if (!reqs.length) return tempReply(ctx, "📭 Abhi tak koi request nahi ki.\n\nMovie search karo aur Request button dabao.");
    const emoji: Record<string, string> = { pending: "⏳", fulfilled: "✅", rejected: "❌" };
    let txt = `📩 *Aapki Requests (${reqs.length})*\n\n`;
    reqs.slice(0, 15).forEach((r) => {
      const e = emoji[r.status] || "⏳";
      const date = new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      txt += `${e} *${escapeMarkdown(r.title)}*\n   ${r.status} — ${date}\n\n`;
    });
    await tempReply(ctx, txt, { parse_mode: "Markdown" });
  });

  bot.command("random", async (ctx) => {
    await trackUser(ctx.from!.id, ctx.from?.first_name, ctx.from?.username);
    await sendRandomMovie(ctx);
  });

  async function sendRandomMovie(ctx: Context, mood: string | null = null) {
    const list = await fetchAllMovies();
    if (!list.length) return tempReply(ctx, "❌ Database abhi empty hai. Koi movie available nahi.");
    const pick = list[Math.floor(Math.random() * list.length)];
    const moodLabel = mood && MOOD_MAP[mood] ? ` — ${MOOD_MAP[mood].label}` : "";
    const caption =
      `🎲 *Random Pick${moodLabel}*\n\n` +
      `🎬 *${escapeMarkdown(pick.title)}* (${pick.year || "?"})\n` +
      `🌐 ${pick.language || "N/A"} | 📺 ${pick.quality || "N/A"}\n\n` +
      `⚡ *3x Fast Download ke liye website visit karein!*`;
    const kb = new InlineKeyboard()
      .text(`⬇️ Download`, `send_${pick.id}`)
      .text(`🎲 Aur Ek`, mood ? `rand_mood_${mood}` : "rand_any").row()
      .url("⚡ 3x Fast Download ke liye Website Visit Karein", WEBSITE_URL).row()
      .url("📷 Instagram (Optional)", INSTAGRAM_URL);
    return tempReply(ctx, caption, { parse_mode: "Markdown", reply_markup: kb });
  }

  // ─── ADMIN COMMANDS ───
  bot.command("stats", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const movies = await fetchAllMovies();
    const users = await listAllUsers();
    const pending = await listPendingRequests();
    const { count: bannedCount } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("banned").select("*", { count: "exact", head: true });
    const txt =
      `📊 *CineRadar AI — Statistics*\n\n` +
      `🎬 *Movies:* ${movies.length}\n` +
      `👥 *Total Users:* ${users.length}\n` +
      `📩 *Pending Requests:* ${pending.length}\n` +
      `🚫 *Banned:* ${bannedCount ?? 0}\n`;
    await ctx.reply(txt, { parse_mode: "Markdown" });
  });

  bot.command("broadcast", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const text = (ctx.message?.text ?? "").replace("/broadcast", "").trim();
    if (!text) return ctx.reply("Usage: /broadcast <message>");
    const users = await listAllUsers();
    await ctx.reply(`📢 Sending to ${users.length} users...`);
    let ok = 0, fail = 0;
    for (const u of users) {
      try {
        await ctx.api.sendMessage(u.telegram_id, `📢 *Announcement*\n\n${escapeMarkdown(text)}`, { parse_mode: "Markdown" });
        ok++;
      } catch { fail++; }
      await new Promise((r) => setTimeout(r, 50));
    }
    await ctx.reply(`✅ Done — Success: ${ok} | Failed: ${fail}`);
  });

  bot.command("delete", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const id = Number((ctx.message?.text ?? "").replace("/delete", "").trim());
    if (!Number.isFinite(id)) return ctx.reply("❌ Usage: /delete <movieId>");
    const m = await fetchMovieById(id);
    if (!m) return ctx.reply("❌ Movie not found.");
    await deleteMovie(id);
    await ctx.reply(`✅ Deleted: ${escapeMarkdown(m.title)}`, { parse_mode: "Markdown" });
  });

  bot.command("ban", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const id = Number((ctx.message?.text ?? "").replace("/ban", "").trim());
    if (!Number.isFinite(id)) return ctx.reply("Usage: /ban <userId>");
    await banUser(id);
    await ctx.reply(`✅ Banned: ${id}`);
  });
  bot.command("unban", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const id = Number((ctx.message?.text ?? "").replace("/unban", "").trim());
    if (!Number.isFinite(id)) return ctx.reply("Usage: /unban <userId>");
    await unbanUser(id);
    await ctx.reply(`✅ Unbanned: ${id}`);
  });

  bot.command("pending", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const pend = await listPendingRequests();
    if (!pend.length) return ctx.reply("✅ No pending requests.");
    let txt = `📩 *Pending Requests — ${pend.length} total*\n\n`;
    const kb = new InlineKeyboard();
    pend.slice(0, 20).forEach((r, i) => {
      const date = new Date(r.created_at).toLocaleDateString("en-IN");
      txt += `*${i + 1}.* 🎬 ${escapeMarkdown(r.title)}\n   👤 ${r.username ?? r.user_id}  |  🆔 \`${r.user_id}\`\n   📅 ${date}\n\n`;
      kb.text(`✅ Fulfill #${i + 1}: ${r.title.slice(0, 20)}`, `rdi_${r.id}`).row();
    });
    await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: kb });
  });

  bot.command("search", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const q = (ctx.message?.text ?? "").replace("/search", "").trim();
    if (!q) return ctx.reply("Usage: /search <name>");
    const all = await fetchAllMovies();
    const res = searchMovies(all, q);
    if (!res.length) return ctx.reply("❌ No results.");
    let txt = `🔍 *${res.length} result(s) for "${escapeMarkdown(q)}"*\n\n`;
    res.slice(0, 15).forEach((m) => {
      txt += `\`${m.id}\` — ${escapeMarkdown(m.title)} (${m.year || "?"}) | ${m.language || "?"} | ${m.quality || "?"}\n`;
    });
    await ctx.reply(txt, { parse_mode: "Markdown" });
  });

  bot.command("dm", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const args = (ctx.message?.text ?? "").replace("/dm", "").trim();
    if (!args) return ctx.reply(`📤 Usage: /dm <userId> <message>`);
    const sp = args.indexOf(" ");
    if (sp === -1) return ctx.reply("❌ Message likhna zaroori hai.");
    const targetId = Number(args.slice(0, sp).trim());
    const dmMsg = args.slice(sp + 1).trim();
    if (!Number.isFinite(targetId)) return ctx.reply("❌ Valid userId dein.");
    try {
      await ctx.api.sendMessage(targetId,
        `📣 *CineRadar AI — Admin Message*\n\n${escapeMarkdown(dmMsg)}\n\n— 👑 CineRadar Admin`,
        { parse_mode: "Markdown" });
      await ctx.reply(`✅ Message Bheja to ${targetId}`);
    } catch (e) {
      await ctx.reply(`❌ Failed: ${(e as Error).message}`);
    }
  });

  bot.command("convo", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const targetId = Number((ctx.message?.text ?? "").replace("/convo", "").trim());
    if (!Number.isFinite(targetId)) {
      const active = await getActiveConvo();
      if (active) {
        const name = await userDisplayName(active.target_user_id);
        return ctx.reply(`💬 *Active Conversation*\n👤 ${escapeMarkdown(name)} (\`${active.target_user_id}\`)\n\n🛑 /endconvo se band karein`, { parse_mode: "Markdown" });
      }
      return ctx.reply(`Usage: /convo <userId>`);
    }
    await setConvo(ctx.from!.id, targetId);
    await ctx.reply(`✅ Conversation started with ${targetId}`);
    try {
      await ctx.api.sendMessage(targetId,
        `📣 *CineRadar Admin aapse baat karna chahte hain.*\n\nAap seedha yahan reply kar sakte hain.`,
        { parse_mode: "Markdown" });
    } catch {}
  });

  bot.command("endconvo", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    await endConvo();
    await ctx.reply(`🛑 Conversation ended.`);
  });

  // ── /fastupload — toggle one-shot caption-parsed upload mode ──
  bot.command("fastupload", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const uid = ctx.from!.id;
    const existing = await getPendingUpload(uid);
    if (existing?.mode === "fastupload") {
      await clearPendingUpload(uid);
      return ctx.reply("🛑 *Fast Upload mode OFF.*", { parse_mode: "Markdown" });
    }
    await clearPendingUpload(uid);
    await setPendingUpload(uid, { mode: "fastupload" });
    return ctx.reply(
      `⚡ *Fast Upload mode ON.*\n\n` +
      `Ab koi bhi video/document caption ke saath bhejo, e.g.:\n` +
      `\`War 2019 720p Hindi\`\n\n` +
      `Title / year / quality / language auto-detect ho jayenge. File size se quality bhi auto-fill hogi.\n\n` +
      `Off karne ke liye /fastupload dobara bhejein.`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /promote — broadcast promotional message to main + backup channel ──
  bot.command("promote", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const text = (ctx.message?.text ?? "").replace("/promote", "").trim();
    if (!text) {
      return ctx.reply(
        `Usage: \`/promote <message>\`\n\nMessage main + backup group dono mein post hoga.`,
        { parse_mode: "Markdown" }
      );
    }
    const targets = [CHANNEL(), BACKUP_CHANNEL()];
    const kb = new InlineKeyboard()
      .url("🎬 Movies Bot — Start", `https://t.me/${BOT_USERNAME()}?start=promo`).row()
      .url("⚡ 3x Fast Download", WEBSITE_URL);
    let ok = 0, fail: string[] = [];
    for (const ch of targets) {
      try {
        await ctx.api.sendMessage(ch,
          `📣 *Promotion*\n\n${escapeMarkdown(text)}\n\n— 🎬 CineRadar AI`,
          { parse_mode: "Markdown", reply_markup: kb });
        ok++;
      } catch (e) { fail.push(`${ch}: ${(e as Error).message}`); }
    }
    return ctx.reply(`✅ Posted to ${ok}/${targets.length}` + (fail.length ? `\n❌ ${fail.join("\n")}` : ""));
  });

  // ── /reply <reqId> <message> — custom reply to a request ──
  bot.command("reply", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const args = (ctx.message?.text ?? "").replace("/reply", "").trim();
    const sp = args.indexOf(" ");
    if (sp === -1) return ctx.reply("Usage: `/reply <requestId> <message>`", { parse_mode: "Markdown" });
    const reqId = Number(args.slice(0, sp).trim());
    const message = args.slice(sp + 1).trim();
    if (!Number.isFinite(reqId) || !message) return ctx.reply("❌ Valid requestId + message dein.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin.from("requests").select("*").eq("id", reqId).maybeSingle();
    if (!req) return ctx.reply("❌ Request not found.");
    try {
      await ctx.api.sendMessage(req.user_id,
        `📩 *Admin Reply* — aapki request: _${escapeMarkdown(req.title)}_\n\n${escapeMarkdown(message)}`,
        { parse_mode: "Markdown" });
      return ctx.reply(`✅ Reply bhej di to ${req.user_id} (${escapeMarkdown(req.title)})`, { parse_mode: "Markdown" });
    } catch (e) {
      return ctx.reply(`❌ Failed: ${(e as Error).message}`);
    }
  });

  bot.command("edit", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("❌ Admin only.");
    const arg = (ctx.message?.text ?? "").replace("/edit", "").trim();
    const id = Number(arg);
    if (!Number.isFinite(id)) {
      return ctx.reply(
        `✏️ *Edit Movie*\n\nUsage: \`/edit <movieId>\`\n\nUse /search to find IDs.`,
        { parse_mode: "Markdown" },
      );
    }
    const m = await fetchMovieById(id);
    if (!m) return ctx.reply("❌ Movie not found.");

    // FIX 3: Clear any stale pending upload before starting edit session
    await clearPendingUpload(ctx.from!.id);
    await setPendingUpload(ctx.from!.id, { mode: "edit", id, step: "field" });

    const kb = new InlineKeyboard()
      .text("📝 Title", `edit_field_title`).text("📅 Year", `edit_field_year`).row()
      .text("🌐 Language", `edit_field_language`).text("📺 Quality", `edit_field_quality`).row()
      .text("❌ Cancel", "edit_cancel");
    return ctx.reply(
      `✏️ *Edit Movie \`${m.id}\`*\n\n` +
      `🎬 ${escapeMarkdown(m.title)}\n` +
      `📅 ${m.year ?? "—"}  |  🌐 ${m.language ?? "—"}  |  📺 ${m.quality ?? "—"}\n\n` +
      `Kaunsa field edit karna hai? *Neeche button dabao:*`,
      { parse_mode: "Markdown", reply_markup: kb },
    );
  });

  // ─── new_chat_members / my_chat_member ───
  bot.on("message:new_chat_members", async (ctx) => {
    for (const member of ctx.message.new_chat_members) {
      if (member.id === ctx.me.id) continue;
      const firstName = escapeMarkdown(member.first_name);
      const welcomeMsg =
        `👋 Welcome ${firstName}\\!\n\n` +
        `🎬 *CineRadar AI* me aapka swagat hai\\.\n` +
        `📌 Movie paane ke liye bas movie ka naam type karein \\(minimum 3 letters\\)\\.\n` +
        `🔍 Example: *Krish*\n\n` +
        `💡 *Website visit karein daily 3x speed download ke liye\\!*\n\n` +
        `🔥 Enjoy HD Movies\\!`;
      await tempReply(ctx, welcomeMsg, { parse_mode: "MarkdownV2" });
    }
  });

  bot.on("my_chat_member", async (ctx) => {
    const newStatus = ctx.update.my_chat_member.new_chat_member.status;
    const oldStatus = ctx.update.my_chat_member.old_chat_member.status;
    if (newStatus === "member" && oldStatus !== "member") {
      const helpText =
        `🤖 *CineRadar AI is now active in this group\\!*\n\n` +
        `🎬 *Available Commands:*\n` +
        `• Type movie name \\(min 3 letters\\) — Search & download\n` +
        `• /new — New Bollywood & South releases\n` +
        `• /upcoming — Upcoming Indian movies\n` +
        `• /myrequests — Track your requests\n` +
        `• /help — Show this message\n\n` +
        `⚡ *3x Speed:* Visit ${WEBSITE_URL} daily to unlock fast downloads\n\n` +
        `📌 *This message is pinned for easy access\\.*\n` +
        `🔞 No 18\\+ content allowed\\.\n` +
        `👑 Admin: @cineradarai\\_admin`;
      try {
        const sent = await ctx.api.sendMessage(ctx.chat.id, helpText, { parse_mode: "MarkdownV2" });
        await ctx.api.pinChatMessage(ctx.chat.id, sent.message_id).catch(() => {});
      } catch (e) { console.error("bot added", (e as Error).message); }
    }
  });

  // ─── MESSAGE HANDLER ───
  bot.on("message", async (ctx) => {
    const msg = ctx.message;
    const uid = ctx.from!.id;
    const isA = isAdmin(uid);
    await trackUser(uid, ctx.from?.first_name, ctx.from?.username);

    // admin convo relay: admin's plain text → user
    if (isA && msg.text && !msg.text.startsWith("/")) {
      const active = await getActiveConvo();
      if (active && active.admin_id === uid) {
        // Make sure admin is not in a pending upload/edit state before relaying
        const pend = await getPendingUpload(uid);
        if (!pend) {
          try {
            await ctx.api.sendMessage(active.target_user_id,
              `📣 *CineRadar Admin:*\n\n${escapeMarkdown(msg.text)}`, { parse_mode: "Markdown" });
            await ctx.reply(`✅ Bhej diya to ${active.target_user_id}`);
          } catch (e) { await ctx.reply(`❌ Failed: ${(e as Error).message}`); }
          return;
        }
      }
    }

    // non-admin in active convo target → relay to admin
    if (!isA && msg.text) {
      const active = await getActiveConvo();
      if (active && active.target_user_id === uid) {
        if (msg.text.startsWith("/")) {
          await ctx.reply(
            `🔒 *Abhi aap admin se baat kar rahe hain.*\n\nIs waqt commands available nahi hain.\nSeedha message karein — admin jawab denge.`,
            { parse_mode: "Markdown" }).catch(() => {});
          return;
        }
        const name = await userDisplayName(uid);
        await logChat(uid, "user", msg.text);
        try {
          await ctx.api.sendMessage(active.admin_id, `💬 [${name}] (${uid}):\n\n${msg.text}`);
        } catch {}
        return;
      }
    }

    // ─── FIX 2: Admin file upload handler ─────────────────────────────────────
    if (isA && (msg.video || msg.document)) {
      const fileId = msg.video?.file_id ?? msg.document?.file_id;
      const fileSize = msg.video?.file_size ?? msg.document?.file_size ?? null;
      const caption = (msg.caption ?? "").trim();
      if (!fileId) {
        return ctx.reply("❌ File ID nahi mila. Dobara try karein.");
      }

      const sizeLabel = fmtSize(fileSize);
      const autoQual = qualityFromSize(fileSize);

      // Check if admin previously entered /fastupload mode
      const existing = await getPendingUpload(uid);
      const fastMode = existing?.mode === "fastupload";

      // FAST UPLOAD: parse caption fully and save in one shot
      if (fastMode || (caption && /\b(19\d{2}|20\d{2})\b/.test(caption))) {
        const parsed = parseCaption(caption);
        if (parsed.name) {
          await clearPendingUpload(uid);
          const pend = {
            mode: "upload",
            file_id: fileId,
            file_size: fileSize,
            name: parsed.name,
            year: parsed.year ? String(parsed.year) : null,
            language: parsed.language,
            quality: parsed.quality || autoQual,
          };
          return finishUpload(ctx, pend, uid);
        }
        if (fastMode) {
          return ctx.reply(
            "⚠️ /fastupload mode ON hai par caption se name parse nahi hua.\nCaption format: `War 2019 720p Hindi`",
            { parse_mode: "Markdown" }
          );
        }
      }

      // Step-by-step (auto-detect quality from size)
      await clearPendingUpload(uid);
      await setPendingUpload(uid, {
        mode: "upload", step: "name", file_id: fileId, file_size: fileSize,
      });
      return ctx.reply(
        `✅ *File Received!*` +
        (sizeLabel ? ` (${sizeLabel})` : "") +
        (autoQual ? ` → 📺 Auto-detected: *${autoQual}*` : "") +
        `\n\n📝 *Step 1/3:* Movie ka naam type karein:\n\n` +
        `_Tip: caption mein \`Name 2019 720p Hindi\` likho to ek-shot save hoga._\n` +
        `_Ya /fastupload toggle karein._`,
        { parse_mode: "Markdown" }
      );
    }

    // ─── FIX 2 & 3: Admin text — upload steps + edit value capture ────────────
    if (isA && msg.text) {
      const pend = await getPendingUpload(uid);
      if (pend) {
        const text = sanitize(msg.text);

        // ── FIX 3: Edit mode — value capture ──
        if (pend.mode === "edit" && pend.step === "value" && pend.field) {
          const patch: any = {};
          if (pend.field === "year") {
            const y = Number(text);
            if (!Number.isFinite(y) || y < 1900 || y > 2100) {
              return ctx.reply("❌ Valid year dein (e.g. 2024).");
            }
            patch.year = y;
          } else {
            if (!text.trim()) return ctx.reply("❌ Yeh field empty nahi ho sakti.");
            patch[pend.field] = text.trim();
          }
          const { movie, error } = await updateMovie(pend.id, patch);
          await clearPendingUpload(uid);
          if (!movie) return ctx.reply(`❌ Edit failed: \`${error || "unknown"}\``, { parse_mode: "Markdown" });
          return ctx.reply(
            `✅ *Updated Successfully!*\n\n🎬 ${escapeMarkdown(movie.title)}\n` +
            `📅 ${movie.year ?? "—"}  |  🌐 ${movie.language ?? "—"}  |  📺 ${movie.quality ?? "—"}`,
            { parse_mode: "Markdown" },
          );
        }

        // FIX 3: Edit mode — "field" step, admin typed instead of clicking button
        if (pend.mode === "edit" && pend.step === "field") {
          return ctx.reply(
            `⚠️ *Button dabao!*\n\nKaunsa field edit karna hai, uska button select karein.`,
            { parse_mode: "Markdown" }
          );
        }

        // ── Upload steps ──
        if (pend.mode === "upload" || !pend.mode) {
          if (pend.step === "name") {
            if (!text.trim()) return ctx.reply("❌ Movie name empty nahi ho sakta. Dobara type karein.");
            pend.name = text.trim();
            pend.step = "year";
            await setPendingUpload(uid, pend);
            return ctx.reply("📅 *Step 2/4:* Release year likho (e.g. 2025):", { parse_mode: "Markdown" });
          }
          if (pend.step === "year") {
            // FIX 2: Validate year before proceeding
            const y = Number(text.trim());
            if (!Number.isFinite(y) || y < 1900 || y > 2100) {
              return ctx.reply("❌ Valid year dein (e.g. 2024). Dobara type karein:");
            }
            pend.year = String(y);
            pend.step = "language";
            await setPendingUpload(uid, pend);
            const kb = new InlineKeyboard()
              .text("🇮🇳 Hindi", "ul_lang_Hindi").text("🇺🇸 English", "ul_lang_English").row()
              .text("🎭 Dual Audio", "ul_lang_Dual Audio").text("🌍 Multi Audio", "ul_lang_Multi Audio").row()
              .text("🎬 Telugu", "ul_lang_Telugu").text("🎬 Tamil", "ul_lang_Tamil").row()
              .text("🎬 Malayalam", "ul_lang_Malayalam").text("🎬 Kannada", "ul_lang_Kannada").row()
              .text("🎬 Punjabi", "ul_lang_Punjabi").text("🎬 Bengali", "ul_lang_Bengali");
            return ctx.reply("🌐 *Step 3/3:* Language select karo (quality file size se auto-detect ho jayegi):", { parse_mode: "Markdown", reply_markup: kb });
          }
          // FIX 2: If step is "language", remind admin to click button
          if (pend.step === "language") {
            const kb = new InlineKeyboard()
              .text("🇮🇳 Hindi", "ul_lang_Hindi").text("🇺🇸 English", "ul_lang_English").row()
              .text("🎭 Dual Audio", "ul_lang_Dual Audio").text("🌍 Multi Audio", "ul_lang_Multi Audio").row()
              .text("🎬 Telugu", "ul_lang_Telugu").text("🎬 Tamil", "ul_lang_Tamil").row()
              .text("🎬 Malayalam", "ul_lang_Malayalam").text("🎬 Kannada", "ul_lang_Kannada").row()
              .text("🎬 Punjabi", "ul_lang_Punjabi").text("🎬 Bengali", "ul_lang_Bengali");
            return ctx.reply("⚠️ *Upar se language button dabao:*", { parse_mode: "Markdown", reply_markup: kb });
          }
          // FIX 2: If step is "quality", remind admin to click button
          if (pend.step === "quality") {
            const kb = new InlineKeyboard()
              .text("360p", "ul_qual_360p").text("480p", "ul_qual_480p").row()
              .text("720p", "ul_qual_720p").text("1080p", "ul_qual_1080p").row()
              .text("4K UHD", "ul_qual_4K").text("HDR", "ul_qual_HDR");
            return ctx.reply("⚠️ *Upar se quality button dabao:*", { parse_mode: "Markdown", reply_markup: kb });
          }
        }
        // Catch-all: unknown step — clear and reset
        await clearPendingUpload(uid);
        return ctx.reply("⚠️ Upload state reset. Dobara video/file bhejein.");
      }
    }

    if (!msg.text || msg.text.startsWith("/")) return;
    if (msg.text.length < 3) return tempReply(ctx, "⚠️ Please enter at least 3 characters.");

    const rawQuery = sanitize(msg.text);
    if (!isA) await logChat(uid, "user", rawQuery);

    // mood
    const mood = detectMood(rawQuery);
    if (mood) {
      await sendRandomMovie(ctx, mood);
      const kb = new InlineKeyboard();
      const others = Object.entries(MOOD_MAP).filter(([m]) => m !== mood);
      others.forEach(([m, d], i) => {
        kb.text(d.label, `mood_${m}`);
        if ((i + 1) % 3 === 0) kb.row();
      });
      kb.row();
      await tempReply(ctx, `${MOOD_MAP[mood].label} mood detect kiya! Aur moods try karo:`, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    if (rawQuery.toLowerCase().trim() === "random" || rawQuery.toLowerCase().includes("random movie")) {
      return sendRandomMovie(ctx);
    }

    const { movieName: parsedName, year: parsedYear, language: parsedLang } = parseQuery(rawQuery);
    const tmdb = await tmdbSearchByTitle(parsedName);
    const allMovies = await fetchAllMovies();

    if (tmdb) {
      let caption = `🎬 *${escapeMarkdown(tmdb.Title)}* (${tmdb.Year})\n`;
      if (tmdb.Genre !== "N/A") caption += `🎭 ${escapeMarkdown(tmdb.Genre)}\n`;
      if (tmdb.imdbRating !== "N/A") caption += `⭐ TMDB: ${tmdb.imdbRating}/10\n`;
      if (tmdb.Director) caption += `🎥 ${escapeMarkdown(tmdb.Director)}\n`;
      if (tmdb.Language !== "N/A") caption += `🌐 ${escapeMarkdown(tmdb.Language)}\n`;
      if (tmdb.Plot !== "N/A") caption += `\n📖 ${escapeMarkdown(tmdb.Plot.slice(0, 200))}\n`;

      let matches = searchMovies(allMovies, parsedName);
      if (parsedYear) matches = matches.filter((m) => String(m.year) === parsedYear);
      if (parsedLang) matches = matches.filter((m) => (m.language || "").toLowerCase() === parsedLang.toLowerCase());

      if (matches.length > 0) {
        caption += `\n✅ *Available — ${matches.length} version(s)*\n⚡ *Neeche se download karo!*`;
        const kb = new InlineKeyboard();
        matches.forEach((m) => kb.text(movieBtnLabel(m), `send_${m.id}`).row());
        kb.url("⚡ 3x Fast Download ke liye Website Visit Karein", WEBSITE_URL).row();
        kb.url("📷 Instagram Follow Karein (Optional)", INSTAGRAM_URL);
        if (matches.length > 1) {
          const fkb = buildFilterKeyboard(parsedName, matches);
          if (tmdb.Poster) return tempPhoto(ctx, tmdb.Poster, { caption, parse_mode: "Markdown", reply_markup: mergeKeyboards(kb, fkb) });
          return tempReply(ctx, caption, { parse_mode: "Markdown", reply_markup: mergeKeyboards(kb, fkb) });
        }
        if (tmdb.Poster) return tempPhoto(ctx, tmdb.Poster, { caption, parse_mode: "Markdown", reply_markup: kb });
        return tempReply(ctx, caption, { parse_mode: "Markdown", reply_markup: kb });
      }
      return showTMDBRequestButtons(ctx, parsedName, tmdb.Poster, caption);
    }

    // DB only
    let results = searchMovies(allMovies, parsedName);
    if (parsedYear) results = results.filter((m) => String(m.year) === parsedYear);
    if (parsedLang) results = results.filter((m) => (m.language || "").toLowerCase() === parsedLang.toLowerCase());
    if (results.length > 0) {
      let txt = `🎬 *${results.length} movie(s) mili "${escapeMarkdown(sanitize(msg.text))}" ke liye:*\n\n`;
      results.forEach((m) => { txt += `• *${escapeMarkdown(m.title)}* ${m.year || ""}\n`; });
      txt += `\n🔽 *Tap to download:*\n⚡ *3x Fast Download ke liye website visit karein!*`;
      const kb = new InlineKeyboard();
      results.forEach((m) => kb.text(movieBtnLabel(m), `send_${m.id}`).row());
      kb.url("⚡ 3x Fast Download ke liye Website Visit Karein", WEBSITE_URL).row();
      kb.url("📷 Instagram Follow Karein (Optional)", INSTAGRAM_URL);
      if (results.length > 1) {
        const fkb = buildFilterKeyboard(parsedName, results);
        return tempReply(ctx, txt, { parse_mode: "Markdown", reply_markup: mergeKeyboards(kb, fkb) });
      }
      return tempReply(ctx, txt, { parse_mode: "Markdown", reply_markup: kb });
    }

    // fuzzy fallback
    const fuzzy = fuzzyMatchMultiple(allMovies, parsedName.toLowerCase(), 5);
    if (fuzzy.length) {
      const txt =
        `🔍 *Database mein similar mila:*\n\n` +
        fuzzy.map((m) => `• *${escapeMarkdown(m.title)}* (${m.year || "?"})`).join("\n") +
        `\n\n__Direct search nahi mila, shayad aap yahi dhundh rahe the?__`;
      const kb = new InlineKeyboard();
      fuzzy.forEach((m) => kb.text(movieBtnLabel(m), `send_${m.id}`).row());
      kb.url("⚡ 3x Fast Download", WEBSITE_URL).row();
      kb.url("📷 Instagram (Optional)", INSTAGRAM_URL);
      return tempReply(ctx, txt, { parse_mode: "Markdown", reply_markup: kb });
    }

    return showTMDBRequestButtons(ctx, parsedName, null, null);
  });

  async function showTMDBRequestButtons(ctx: Context, query: string, fallbackPoster: string | null, existingCaption: string | null) {
    let tmdbResults = await tmdbSearchMultiple(query, 8);
    if (tmdbResults.length < 3) {
      const words = query.trim().split(" ");
      if (words.length > 1) {
        const shortQuery = words.slice(0, -1).join(" ");
        const extra = await tmdbSearchMultiple(shortQuery, 8);
        const seen = new Set(tmdbResults.map((r) => r.tmdbId));
        for (const r of extra) if (!seen.has(r.tmdbId)) { tmdbResults.push(r); seen.add(r.tmdbId); }
      }
    }
    const display = tmdbResults.slice(0, 8);
    const safeQuery = escapeMarkdown(query);
    const kb = new InlineKeyboard();
    for (const r of display) {
      const label = `🎬 ${r.title} (${r.year}) — ${r.language}`.slice(0, 64);
      const key = await storePayload({ title: r.title, year: r.year, language: r.language });
      kb.text(label, `req_confirm_${key}`).row();
    }
    kb.text(`📩 "${query.slice(0, 30)}" Request Karein`, `req_pick_${encodeURIComponent(query)}`).row();
    kb.url("⚡ Website Visit Karein", WEBSITE_URL);
    if (display.length > 0) {
      if (fallbackPoster) {
        return tempPhoto(ctx, fallbackPoster, {
          caption: (existingCaption || "") + `\n❌ Abhi hamare paas nahi hai.\n\nKaunsi movie chahiye? Select karo:`,
          parse_mode: "Markdown", reply_markup: kb,
        });
      }
      return tempReply(ctx,
        `❌ *"${safeQuery}"* abhi hamare paas nahi hai.\n\nTMDB pe yeh movies mili hain — sahi wali select karo:\n_Ek click mein request admin ke paas jayegi_`,
        { parse_mode: "Markdown", reply_markup: kb });
    }
    return tempReply(ctx,
      `❌ *"${safeQuery}"* TMDB pe bhi nahi mili.\n\nNaam thoda alag ho sakta hai — check karo:\n• Spelling sahi hai?\n• Hindi film ka English naam try karo\n\nPhir bhi request karna chahte ho?`,
      { parse_mode: "Markdown", reply_markup: kb });
  }

  // ─── CALLBACK HANDLER ───
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const uid = ctx.from.id;
    const chatId = ctx.callbackQuery.message?.chat?.id;

    if (data === "rand_any") {
      await ctx.answerCallbackQuery({ text: "🎲 Naya random pick..." });
      return sendRandomMovie(ctx);
    }
    if (data.startsWith("rand_mood_")) {
      const mood = data.slice("rand_mood_".length);
      await ctx.answerCallbackQuery({ text: `🎲 ${MOOD_MAP[mood]?.label || mood} random...` });
      return sendRandomMovie(ctx, mood);
    }
    if (data.startsWith("mood_")) {
      const mood = data.slice("mood_".length);
      if (!MOOD_MAP[mood]) return ctx.answerCallbackQuery({ text: "❌ Invalid mood" });
      await ctx.answerCallbackQuery({ text: `${MOOD_MAP[mood].label} movies...` });
      return sendRandomMovie(ctx, mood);
    }

    // ── FIX 3: Edit mode callbacks ──
    if (data === "edit_cancel") {
      if (!isAdmin(uid)) return ctx.answerCallbackQuery({ text: "❌ Admin only" });
      await clearPendingUpload(uid);
      try { await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }); } catch {}
      return ctx.answerCallbackQuery({ text: "✅ Edit cancelled" });
    }

    if (data.startsWith("edit_field_")) {
      if (!isAdmin(uid)) return ctx.answerCallbackQuery({ text: "❌ Admin only" });
      const pend = await getPendingUpload(uid);
      if (!pend || pend.mode !== "edit") {
        return ctx.answerCallbackQuery({ text: "❌ No active edit. Use /edit <id>", show_alert: true });
      }
      const field = data.slice("edit_field_".length);

      if (field === "language") {
        pend.field = "language";
        pend.step = "value";
        await setPendingUpload(uid, pend);
        const kb = new InlineKeyboard()
          .text("🇮🇳 Hindi", "edit_lang_Hindi").text("🇺🇸 English", "edit_lang_English").row()
          .text("🎭 Dual Audio", "edit_lang_Dual Audio").text("🌍 Multi Audio", "edit_lang_Multi Audio").row()
          .text("🎬 Telugu", "edit_lang_Telugu").text("🎬 Tamil", "edit_lang_Tamil").row()
          .text("🎬 Malayalam", "edit_lang_Malayalam").text("🎬 Kannada", "edit_lang_Kannada").row()
          .text("❌ Cancel", "edit_cancel");
        // FIX 3: answerCallbackQuery BEFORE ctx.reply
        await ctx.answerCallbackQuery({ text: "🌐 Language select karein" });
        return ctx.reply("🌐 *New language select karo:*", { parse_mode: "Markdown", reply_markup: kb });
      }

      if (field === "quality") {
        pend.field = "quality";
        pend.step = "value";
        await setPendingUpload(uid, pend);
        const kb = new InlineKeyboard()
          .text("360p", "edit_qual_360p").text("480p", "edit_qual_480p").row()
          .text("720p", "edit_qual_720p").text("1080p", "edit_qual_1080p").row()
          .text("4K UHD", "edit_qual_4K").text("HDR", "edit_qual_HDR").row()
          .text("❌ Cancel", "edit_cancel");
        // FIX 3: answerCallbackQuery BEFORE ctx.reply
        await ctx.answerCallbackQuery({ text: "📺 Quality select karein" });
        return ctx.reply("📺 *New quality select karo:*", { parse_mode: "Markdown", reply_markup: kb });
      }

      // title / year — free text input
      pend.field = field;
      pend.step = "value";
      await setPendingUpload(uid, pend);
      await ctx.answerCallbackQuery({ text: `✏️ ${field} type karein` });
      return ctx.reply(
        `✏️ *New ${field} type karein:*\n\n_Current: ${field === "title" ? "Movie naam" : "Year"}_`,
        { parse_mode: "Markdown" }
      );
    }

    // FIX 3: Edit language/quality button callbacks
    if (data.startsWith("edit_lang_") || data.startsWith("edit_qual_")) {
      if (!isAdmin(uid)) return ctx.answerCallbackQuery({ text: "❌ Admin only" });
      const pend = await getPendingUpload(uid);
      if (!pend || pend.mode !== "edit") {
        return ctx.answerCallbackQuery({ text: "❌ No active edit. Use /edit <id>", show_alert: true });
      }
      const isLang = data.startsWith("edit_lang_");
      const val = data.slice(isLang ? "edit_lang_".length : "edit_qual_".length);
      const patch: any = isLang ? { language: val } : { quality: val };
      const { movie, error } = await updateMovie(pend.id, patch);
      await clearPendingUpload(uid);
      if (!movie) {
        return ctx.answerCallbackQuery({ text: `❌ Update failed: ${error || "Unknown error"}`, show_alert: true });
      }
      // FIX 3: answerCallbackQuery BEFORE ctx.reply
      await ctx.answerCallbackQuery({ text: `✅ ${isLang ? "Language" : "Quality"} updated!` });
      return ctx.reply(
        `✅ *Updated Successfully!*\n\n🎬 ${escapeMarkdown(movie.title)}\n` +
        `📅 ${movie.year ?? "—"}  |  🌐 ${movie.language ?? "—"}  |  📺 ${movie.quality ?? "—"}`,
        { parse_mode: "Markdown" },
      );
    }

    // ─── FIX 2: Upload step callbacks ────────────────────────────────────────
    if (data.startsWith("ul_lang_")) {
      if (!isAdmin(uid)) return ctx.answerCallbackQuery({ text: "❌ Admin only" });
      const pend = await getPendingUpload(uid);
      if (!pend) return ctx.answerCallbackQuery({ text: "❌ No active upload. Pehle file bhejein.", show_alert: true });
      pend.language = data.slice("ul_lang_".length);
      const autoQ = qualityFromSize(pend.file_size);
      if (autoQ) {
        pend.quality = autoQ;
        await setPendingUpload(uid, pend);
        await ctx.answerCallbackQuery({ text: `✅ ${pend.language} · 📺 Auto: ${autoQ}` });
        return finishUpload(ctx, pend, uid);
      }
      // Fallback: ask manually if size missing
      pend.step = "quality";
      await setPendingUpload(uid, pend);
      await ctx.answerCallbackQuery({ text: `✅ Language: ${pend.language}` });
      const kb = new InlineKeyboard()
        .text("360p", "ul_qual_360p").text("480p", "ul_qual_480p").row()
        .text("720p", "ul_qual_720p").text("1080p", "ul_qual_1080p").row()
        .text("4K UHD", "ul_qual_4K").text("HDR", "ul_qual_HDR");
      return ctx.reply(
        `✅ Language: *${pend.language}*\n\n📺 Quality select karo (file size missing, auto-detect fail):`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
    }

    if (data.startsWith("ul_qual_")) {
      if (!isAdmin(uid)) return ctx.answerCallbackQuery({ text: "❌ Admin only" });
      const pend = await getPendingUpload(uid);
      if (!pend) return ctx.answerCallbackQuery({ text: "❌ No active upload. Pehle file bhejein.", show_alert: true });
      pend.quality = data.slice("ul_qual_".length);
      // FIX 2: Save quality to DB before finishUpload (ensures data integrity)
      await setPendingUpload(uid, pend);
      await ctx.answerCallbackQuery({ text: `✅ Quality: ${pend.quality} — Saving...` });
      return finishUpload(ctx, pend, uid);
    }

    if (data.startsWith("send_")) {
      const id = Number(data.slice("send_".length));
      const m = await fetchMovieById(id);
      if (!m) return ctx.answerCallbackQuery({ text: "❌ Movie not found", show_alert: true });
      await logChat(uid, "bot", `[Download] ${m.title}`);
      const caption =
        `🎬 *${escapeMarkdown(m.title)}* (${m.year || "?"})\n` +
        `🌐 ${m.language || "N/A"} | 📺 ${m.quality || "N/A"}\n\n` +
        `💡 *3x Fast Download chahiye? Website visit karein ek baar!*\n` +
        `⏱️ *Auto-deletes in 5 min — forward & save karein.*`;
      const kb = new InlineKeyboard()
        .url("⚡ 3x Fast Download ke liye Website Visit Karein", WEBSITE_URL).row()
        .url("📷 Instagram Follow Karein (Optional)", INSTAGRAM_URL);
      try {
        const sent = await ctx.replyWithVideo(m.file_id, { caption, parse_mode: "Markdown", reply_markup: kb });
        if (!isAdmin(uid) && chatId) scheduleDelete(ctx.api, chatId, sent.message_id);
        return ctx.answerCallbackQuery({ text: `📥 ${m.title} download ho rahi hai!` });
      } catch (e) {
        console.error("send_", (e as Error).message);
        return ctx.answerCallbackQuery({ text: "❌ Error sending file.", show_alert: true });
      }
    }

    if (data.startsWith("f|")) {
      const parts = data.split("|");
      if (parts.length < 4) return ctx.answerCallbackQuery();
      const [, q, type, val] = parts;
      const all = await fetchAllMovies();
      const filters: any = {};
      if (type === "lang") filters.language = val;
      if (type === "qual") filters.quality = val;
      if (type === "year") filters.year = val;
      const results = type === "all" ? searchMovies(all, q) : searchMovies(all, q, filters);
      if (!results.length) return ctx.answerCallbackQuery({ text: "No results", show_alert: true });
      const kb = new InlineKeyboard();
      results.forEach((m) => kb.text(movieBtnLabel(m), `send_${m.id}`).row());
      kb.url("⚡ 3x Fast Download ke liye Website Visit Karein", WEBSITE_URL).row();
      kb.url("📷 Instagram (Optional)", INSTAGRAM_URL);
      const fkb = buildFilterKeyboard(q, results);
      try { await ctx.editMessageReplyMarkup({ reply_markup: mergeKeyboards(kb, fkb) }); } catch {}
      return ctx.answerCallbackQuery({ text: `${results.length} result(s)` });
    }

    if (data.startsWith("req_pick_")) {
      const rawQuery = decodeURIComponent(data.slice("req_pick_".length));
      await ctx.answerCallbackQuery({ text: "🔍 TMDB pe dhundh raha hoon..." });
      const tmdbResults = await tmdbSearchMultiple(rawQuery, 6);
      if (!tmdbResults.length) {
        const already = await findPendingRequest(uid, rawQuery);
        if (already) return ctx.reply("⚠️ Yeh movie already request ki hui hai!");
        await insertRequest(uid, ctx.from.username || null, rawQuery);
        await tempReply(ctx, `✅ Request bhej di: ${rawQuery}\n\n/myrequests se track karo.`);
        for (const adminId of ADMIN_IDS()) {
          await ctx.api.sendMessage(adminId, `📩 New Request\n\n🎬 ${rawQuery}\n👤 ${await userDisplayName(uid)} (${uid})`).catch(() => {});
        }
        return;
      }
      const kb = new InlineKeyboard();
      for (const r of tmdbResults) {
        const label = `🎬 ${r.title} (${r.year}) — ${r.language}`.slice(0, 64);
        const key = await storePayload({ title: r.title, year: r.year, language: r.language });
        kb.text(label, `req_confirm_${key}`).row();
      }
      kb.text("❌ Cancel", "noop");
      await tempReply(ctx,
        `🔍 "${rawQuery}" ke liye TMDB pe yeh movies mili hain:\n\nSahi movie select karo — wahi request mein jayegi:`,
        { reply_markup: kb });
      return;
    }

    if (data.startsWith("req_confirm_")) {
      const key = data.slice("req_confirm_".length);
      const stored = await getPayload(key);
      if (!stored) return ctx.answerCallbackQuery({ text: "❌ Request expired", show_alert: true });
      const title = stored.title;
      const year = stored.year || "";
      const lang = stored.language || "";
      const requestName = year ? `${title} (${year})` : title;
      const already = await findPendingRequest(uid, requestName);
      if (already) return ctx.answerCallbackQuery({ text: `⚠️ "${requestName}" already requested!`, show_alert: true });
      const inserted = await insertRequest(uid, ctx.from.username || null, requestName);
      await ctx.answerCallbackQuery({ text: `✅ Request sent: ${requestName.slice(0, 40)}` });
      await tempReply(ctx,
        `✅ *Request Bhej Di!*\n\n🎬 *${escapeMarkdown(requestName)}*\n` +
        (lang ? `🌐 ${escapeMarkdown(lang)}\n` : "") + `\n📋 /myrequests se track karo.`,
        { parse_mode: "Markdown" });
      for (const adminId of ADMIN_IDS()) {
        const adminKb = new InlineKeyboard()
          .text("💬 Custom Reply", `req_reply_${uid}`).row();
        if (inserted) adminKb.text(`✅ Fulfill #${inserted.id}`, `rdi_${inserted.id}`);
        await ctx.api.sendMessage(adminId,
          `📩 *New Movie Request*\n\n🎬 *${escapeMarkdown(requestName)}*\n` +
          (lang ? `🌐 ${escapeMarkdown(lang)}\n` : "") +
          `👤 ${escapeMarkdown(await userDisplayName(uid))} (${uid})`,
          { parse_mode: "Markdown", reply_markup: adminKb }).catch(() => {});
      }
      return;
    }

    // ── Custom reply: admin clicks "Custom Reply" → start convo with that user ──
    if (data.startsWith("req_reply_")) {
      if (!isAdmin(uid)) return ctx.answerCallbackQuery({ text: "❌ Admin only" });
      const targetId = Number(data.slice("req_reply_".length));
      if (!Number.isFinite(targetId)) return ctx.answerCallbackQuery({ text: "❌ Invalid user" });
      await setConvo(uid, targetId);
      await ctx.answerCallbackQuery({ text: `💬 Convo started with ${targetId}` });
      try {
        await ctx.api.sendMessage(targetId,
          `📣 *CineRadar Admin aapse baat karna chahte hain — aapki request ke baare mein.*\n\nSeedha yahaan reply karein.`,
          { parse_mode: "Markdown" });
      } catch {}
      return ctx.reply(
        `💬 *Convo started.* Ab aap jo type karenge wo seedha user (${targetId}) ko jayega.\n\n🛑 /endconvo se band karein.`,
        { parse_mode: "Markdown" }
      );
    }

    if (data.startsWith("rdi_")) {
      if (!isAdmin(uid)) return ctx.answerCallbackQuery({ text: "❌ Admin only" });
      const id = Number(data.slice("rdi_".length));
      const req = await fulfillRequest(id);
      if (!req) return ctx.answerCallbackQuery({ text: "❌ Request not found", show_alert: true });
      // FIX: Strip year from request title for movie search
      const titleForSearch = req.title.replace(/\s*\(\d{4}\)\s*$/, "").trim();
      const all = await fetchAllMovies();
      const matched = searchMovies(all, titleForSearch);
      if (!matched.length) {
        try {
          await ctx.api.sendMessage(req.user_id,
            `📩 *Aapki Request Update!*\n\n🎬 *${escapeMarkdown(req.title)}*\n\n✅ Admin ne aapki request dekh li hai!\n⏳ Movie jaldi upload hogi.`,
            { parse_mode: "Markdown" });
        } catch {}
        return ctx.answerCallbackQuery({ text: "✅ User notified — movie not yet in DB" });
      }
      const m = matched[0];
      const dmKb = new InlineKeyboard()
        .text(`⬇️ Download Karein`, `send_${m.id}`).row()
        .url("⚡ 3x Fast Download ke liye Website Visit Karein", WEBSITE_URL).row()
        .url("📷 Instagram (Optional)", INSTAGRAM_URL);
      try {
        await ctx.api.sendVideo(req.user_id, m.file_id, {
          caption:
            `🎉 *Aapki Requested Movie Ready Hai!*\n\n🎬 *${escapeMarkdown(m.title)}* (${m.year || "?"})\n` +
            `🌐 ${m.language || "N/A"} | 📺 ${m.quality || "N/A"}\n\n` +
            `✅ *Ab aap is movie ko download kar sakte hain!*`,
          parse_mode: "Markdown", reply_markup: dmKb,
        });
        return ctx.answerCallbackQuery({ text: `✅ ${m.title} — DM bhej di!` });
      } catch (e) {
        await ctx.reply(`⚠️ Marked fulfilled, lekin DM nahi gayi: ${(e as Error).message}`).catch(() => {});
        return ctx.answerCallbackQuery({ text: "✅ Fulfilled (DM failed)", show_alert: true });
      }
    }

    if (data.startsWith("post_to_channel_")) {
      if (!isAdmin(uid)) return ctx.answerCallbackQuery({ text: "❌ Admin only" });
      const id = Number(data.slice("post_to_channel_".length));
      const m = await fetchMovieById(id);
      if (!m) return ctx.answerCallbackQuery({ text: "❌ Movie not found" });
      try {
        await ctx.api.sendVideo(CHANNEL(), m.file_id, {
          caption:
            `🎬 *New Movie Added!*\n\n${escapeMarkdown(m.title)} (${m.year || "?"})\n` +
            `🌐 ${m.language || "N/A"} | 📺 ${m.quality || "N/A"}\n\n📥 Use the bot to download!\n` +
            `⚡ *3x Fast Download ke liye website par ek baar visit karein!*`,
          parse_mode: "Markdown",
        });
        try { await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text("✅ Posted to Channel", "noop") }); } catch {}
        return ctx.answerCallbackQuery({ text: "✅ Posted to channel!" });
      } catch (e) {
        return ctx.answerCallbackQuery({ text: `❌ Failed: ${(e as Error).message}`, show_alert: true });
      }
    }

    if (data === "dismiss_post" || data === "noop" || data === "done") {
      try { await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }); } catch {}
      return ctx.answerCallbackQuery();
    }

    return ctx.answerCallbackQuery();
  });

  void PRIMARY_ADMIN;
  return bot;
}
