import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSettings } from "./settings.server";
import { updateMovie, type MovieRow } from "./db.server";

/** Mirror a freshly uploaded file into the storage channel and persist coords. */
export async function archiveMovieToStorage(
  api: any,
  movie: MovieRow,
): Promise<{ chat_id: number; message_id: number } | null> {
  if (movie.storage_message_id && movie.storage_chat_id) {
    return { chat_id: movie.storage_chat_id, message_id: movie.storage_message_id };
  }
  const s = await getSettings();
  const chatId = s.storage_channel_id;
  try {
    const caption =
      `🎬 ${movie.title}` +
      (movie.year ? ` (${movie.year})` : "") +
      ` | ${movie.language || "N/A"} | ${movie.quality || "N/A"}\n` +
      `🆔 db:${movie.id}`;
    const sent =
      movie.file_kind === "document"
        ? await api.sendDocument(chatId, movie.file_id, { caption })
        : await api.sendVideo(chatId, movie.file_id, { caption });
    const mid = sent?.message_id;
    if (!mid) return null;
    await updateMovie(movie.id, {
      storage_chat_id: chatId,
      storage_message_id: mid,
    });
    return { chat_id: chatId, message_id: mid };
  } catch (e) {
    console.error("[storage] archive failed", movie.id, (e as Error).message);
    return null;
  }
}

export interface MigrationProgress {
  running: boolean;
  last_id: number;
  done: number;
  failed: number;
  total: number;
  started_at: string | null;
  current_id?: number | null;
  last_error?: string | null;
  failed_ids?: number[];
}

function telegramErrorDetails(error: unknown): string {
  const e = error as any;
  const parts = [
    e?.description,
    e?.message,
    e?.error_code ? `code=${e.error_code}` : null,
    e?.response?.description,
    e?.response?.error_code ? `response_code=${e.response.error_code}` : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(" | ").slice(0, 1000);
  try { return JSON.stringify(error).slice(0, 1000); } catch { return String(error); }
}

export async function getMigrationDbStats(): Promise<{ total: number; archived: number; legacy: number }> {
  const [{ count: total }, { count: archived }, { count: legacy }] = await Promise.all([
    supabaseAdmin.from("movies").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("movies").select("*", { count: "exact", head: true }).not("storage_message_id", "is", null),
    supabaseAdmin.from("movies").select("*", { count: "exact", head: true }).is("storage_message_id", null),
  ]);
  return { total: total ?? 0, archived: archived ?? 0, legacy: legacy ?? 0 };
}

export async function getMigrationProgress(): Promise<MigrationProgress> {
  const { data } = await supabaseAdmin
    .from("bot_settings")
    .select("value")
    .eq("key", "migration_progress")
    .maybeSingle();
  const v = (data?.value as any) || {};
  return {
    running: !!v.running,
    last_id: Number(v.last_id ?? 0),
    done: Number(v.done ?? 0),
    failed: Number(v.failed ?? 0),
    total: Number(v.total ?? 0),
    started_at: v.started_at ?? null,
    current_id: v.current_id ?? null,
    last_error: v.last_error ?? null,
    failed_ids: Array.isArray(v.failed_ids) ? v.failed_ids.map(Number).filter(Number.isFinite) : [],
  };
}

export async function setMigrationProgress(p: Partial<MigrationProgress>): Promise<void> {
  const cur = await getMigrationProgress();
  const next = { ...cur, ...p };
  await supabaseAdmin
    .from("bot_settings")
    .upsert(
      { key: "migration_progress", value: next as any, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
}

/** Run/resume migration of legacy movies (no storage_message_id) into the storage channel. */
export async function runMigration(
  api: any,
  opts: {
    batch?: number;
    sleepMs?: number;
    onProgress?: (p: MigrationProgress) => Promise<void> | void;
  } = {},
): Promise<MigrationProgress> {
  const batch = opts.batch ?? 15;
  const sleepMs = opts.sleepMs ?? 300;
  const s = await getSettings();
  const storageChat = s.storage_channel_id;

  const stats = await getMigrationDbStats();
  const prior = await getMigrationProgress();
  let done = prior.done ?? stats.archived;
  let failed = prior.failed ?? 0;
  const total = stats.legacy;

  await setMigrationProgress({
    running: true,
    total,
    started_at: prior.started_at ?? new Date().toISOString(),
    done,
    failed,
    last_id: prior.last_id ?? 0,
    current_id: null,
    last_error: null,
  });

  console.log(
    `[migrate] total old movies found=${stats.legacy} storageChat=${storageChat} ` +
      `done=${done} failed=${failed} batch=${batch}`,
  );

  // Pull the next page of legacy rows. We do NOT use last_id as a hard cursor —
  // failed rows would be skipped forever. Instead, always fetch rows that still
  // have storage_message_id IS NULL; on success they leave the set, on failure
  // they remain but we increment failed and a future invocation can retry.
  const { data: rows, error } = await supabaseAdmin
    .from("movies")
    .select("*")
    .is("storage_message_id", null)
    .not("file_id", "is", null)
    .order("id", { ascending: true })
    .limit(batch);

  if (error) {
    console.error("[migrate] page error:", error.message);
    await setMigrationProgress({ running: false });
    return await getMigrationProgress();
  }

  if (!rows || rows.length === 0) {
    console.log("[migrate] nothing left to migrate");
    await setMigrationProgress({ running: false, total: 0, current_id: null });
    return await getMigrationProgress();
  }

  console.log(`[migrate] processing ${rows.length} legacy movie(s)`);

  let lastId = prior.last_id ?? 0;
  const failedIds: number[] = [...(prior.failed_ids ?? [])].slice(-25);

  for (const row of rows as any as MovieRow[]) {
    const cur2 = await getMigrationProgress();
    if (!cur2.running) {
      console.log("[migrate] stop requested, halting batch");
      break;
    }
    await setMigrationProgress({ current_id: row.id, last_error: null });
    console.log(
      `[migrate] current migrating movie ID=${row.id} kind=${row.file_kind} ` +
        `file_id=${String(row.file_id).slice(0, 24)}… title=${JSON.stringify(row.title)}`,
    );
    try {
      const caption =
        `🎬 ${row.title}` +
        (row.year ? ` (${row.year})` : "") +
        ` | ${row.language || "N/A"} | ${row.quality || "N/A"}\n` +
        `🆔 db:${row.id} (migrated)`;

      let sent: any = null;
      let lastErr: any = null;

      const primary = row.file_kind === "document" ? "sendDocument" : "sendVideo";
      const fallback = primary === "sendVideo" ? "sendDocument" : "sendVideo";

      try {
        sent = await (api as any)[primary](storageChat, row.file_id, { caption });
      } catch (e1) {
        lastErr = e1;
        const msg1 = telegramErrorDetails(e1);
        console.warn(
          `[migrate] id=${row.id} ${primary} failed: ${msg1} — trying ${fallback}`,
        );
        try {
          sent = await (api as any)[fallback](storageChat, row.file_id, { caption });
        } catch (e2) {
          lastErr = e2;
          const msg2 = telegramErrorDetails(e2);
          console.error(
            `[migrate] id=${row.id} ${fallback} also failed: ${msg2}`,
          );
        }
      }

      const mid = sent?.message_id;
      if (mid) {
        await updateMovie(row.id, {
          storage_chat_id: storageChat,
          storage_message_id: mid,
        });
        done++;
        console.log(`[migrate] success id=${row.id} storage_chat_id=${storageChat} storage_message_id=${mid} success_count=${done} failed_count=${failed}`);
      } else {
        failed++;
        failedIds.push(row.id);
        const errText = telegramErrorDetails(lastErr ?? "Telegram returned no message_id");
        console.error(
          `[migrate] FAILED id=${row.id} success_count=${done} failed_count=${failed} telegram_error=${errText}`,
        );
        await setMigrationProgress({ last_error: `ID ${row.id}: ${errText}`, failed_ids: failedIds.slice(-25) });
      }
    } catch (e) {
      failed++;
      failedIds.push(row.id);
      const errText = telegramErrorDetails(e);
      console.error(`[migrate] unexpected id=${row.id} success_count=${done} failed_count=${failed} error=${errText}`);
      await setMigrationProgress({ last_error: `ID ${row.id}: ${errText}`, failed_ids: failedIds.slice(-25) });
    }
    lastId = row.id;
    await new Promise((r) => setTimeout(r, sleepMs));
    await setMigrationProgress({ last_id: lastId, done, failed, failed_ids: failedIds.slice(-25) });
  }

  const after = await getMigrationDbStats();
  await setMigrationProgress({ running: false, last_id: lastId, done, failed, total: after.legacy, current_id: null, failed_ids: failedIds.slice(-25) });
  const final = await getMigrationProgress();
  console.log(
    `[migrate] batch finished — success_count=${final.done} failed_count=${final.failed} ` +
      `remaining_old_movies=${after.legacy} failedIds=[${failedIds.join(",")}]`,
  );
  if (opts.onProgress) await opts.onProgress(final);
  return final;
}

export async function stopMigration(): Promise<void> {
  await setMigrationProgress({ running: false });
}