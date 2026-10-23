async function deliverUserPendingRequests(ctx: Context, userId: number): Promise<number> {
  const pending = (await getUserRequests(userId)).filter((r) => r.status === "pending");
  if (!pending.length) return 0;

  const all = await fetchAllMovies();
  let delivered = 0;

  for (const req of pending) {
    const query = req.title.replace(/\s*\(\d{4}\)\s*$/, "").trim();
    const candidates = searchMovies(all, query || req.title);
    const movie = candidates[0] ?? null;
    if (!movie) continue;

    const caption =
      `🎉 *Aapki Requested Movie Ready Hai!*\n\n` +
      `🎬 *${escapeMarkdown(movie.title)}* (${movie.year || "?"})\n` +
      `🌐 ${movie.language || "N/A"} | 📺 ${movie.quality || "N/A"}\n\n` +
      `✅ *Ab aap is movie ko download kar sakte hain!*`;

    try {
      const kb = new InlineKeyboard()
        .text(`⬇️ Download Karein`, `send_${movie.id}`).row()
        .url("⚡ 3x Fast Download ke liye Website Visit Karein", WEBSITE_URL).row()
        .url("📷 Instagram (Optional)", INSTAGRAM_URL);
      await sendMovieFile(ctx.api, userId, movie, {
        caption,
        parse_mode: "Markdown",
        reply_markup: await withBackupKb(kb, movie.id),
      });
      await fulfillRequest(req.id);
      delivered++;
    } catch (e) {
      console.error("[verify_join] deliver requested movie failed", userId, req.id, (e as Error).message);
    }
  }

  return delivered;
}

async function sendJoinAllInDm(bot: Bot, uid: number) {
  const s = await getSettings();
  const kb = new InlineKeyboard();
  const mainLink = asHttpsLink(s.main_group_link || s.force_join_link);
  const backupLink = asHttpsLink(s.backup_group_link);
  if (mainLink) kb.url("📢 Main Group Join Karein", mainLink).row();
  if (backupLink) kb.url("🗂️ Backup Group Join Karein", backupLink).row();
  kb.text("✅ Sab Join Kar Li — Verify", "verify_join");
  await bot.api.sendMessage(uid,
    `🎬 *Welcome CineRadar!*\n\n` +
    `Bot use karne se pehle neeche diye sab groups join karo, phir *Verify* dabaao.\n` +
    `Verify hone ke baad group me movie ka naam likhte hi turant reply milega.`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch((e) => console.error("[sendJoinAllInDm]", (e as Error).message));
}

async function sendForceJoinMsg(ctx: Context) {
  const s = await getSettings();
  const mainLink = asHttpsLink(s.main_group_link || s.force_join_link);
  const backupLink = asHttpsLink(s.backup_group_link);
  const kb = new InlineKeyboard();
  if (mainLink) kb.url("📢 Main Group Join Karein", mainLink).row();
  if (backupLink) kb.url("🗂️ Backup Group Join Karein", backupLink).row();
  kb.text("✅ Join Kar Li — Verify", "verify_join");
  await ctx.reply(
    `🔒 *Bot Use Karne Ke Liye Pehle Group Join Karein!*\n\n` +
    (mainLink ? `📢 Main Group: ${mainLink}\n` : "") +
    (backupLink ? `🗂️ Backup Group: ${backupLink}\n\n` : "\n") +
    `Join karke *"✅ Join Kar Li — Verify"* button dabaao.`,
    { parse_mode: "Markdown", reply_markup: kb }
  ).catch((e) => console.error("[sendForceJoinMsg]", (e as Error).message));
}

async function maybeSendDailyDigest(bot: Bot, userId: number) {
  try {
    const key = `daily_sent_user_${userId}`;
    const { data: row } = await supabaseAdmin
      .from("bot_settings" as any).select("value").eq("key", key).maybeSingle();
    const todayUTC = new Date().toISOString().slice(0, 10);
    if (row && (row as any).value === todayUTC) return;

    const sent = await getSentTmdbIds();
    const released = await getIndianMoviesByType("new", 12);
    const upcoming = await getIndianMoviesByType("upcoming", 12);
    const freshReleased = released.filter((m) => !sent.has(m._tmdbId)).slice(0, 2);
    const freshUpcoming = upcoming.filter((m) => !sent.has(m._tmdbId)).slice(0, 1);
    if (!freshReleased.length && !freshUpcoming.length) {
      await supabaseAdmin.from("bot_settings").upsert({
        key, value: todayUTC as any, updated_at: new Date().toISOString(),
      }, { onConflict: "key" });
      return;
    }

    const intro =
      `🎬 *Daily Movie Update — ${todayUTC}*\n\n` +
      `🆕 ${freshReleased.length} recently released  •  🔮 ${freshUpcoming.length} upcoming`;
    await bot.api.sendMessage(userId, intro, { parse_mode: "Markdown" }).catch(() => {});

    const send = async (m: any, label: string) => {
      const cap =
        `${label} *${escapeMarkdown(m.Title)}* (${m.Year})\n` +
        (m._releaseDate ? `📅 ${escapeMarkdown(m._releaseDate)}\n` : "") +
        (m._language && m._language !== "N/A" ? `🌐 ${escapeMarkdown(m._language)}\n` : "") +
        (m.imdbRating !== "N/A" ? `⭐ TMDB: ${m.imdbRating}/10\n` : "") +
        (m.Plot !== "N/A" ? `\n📖 ${escapeMarkdown(String(m.Plot).slice(0, 220))}` : "");
      try {
        await bot.api.sendPhoto(userId, m.Poster, { caption: cap, parse_mode: "Markdown" });
      } catch (e) {
        console.error("[daily digest send]", userId, (e as Error).message);
      }
    };
    for (const m of freshReleased) await send(m, "🆕");
    for (const m of freshUpcoming) await send(m, "🔮");

    await markTmdbSent([
      ...freshReleased.map((m) => ({ tmdb_id: m._tmdbId, kind: "released" })),
      ...freshUpcoming.map((m) => ({ tmdb_id: m._tmdbId, kind: "upcoming" })),
    ]);
    await supabaseAdmin.from("bot_settings").upsert({
      key, value: todayUTC as any, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
  } catch (e) {
    console.error("[daily digest]", (e as Error).message);
  }
}
