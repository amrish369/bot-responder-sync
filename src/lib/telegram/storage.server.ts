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
  opts: { batch?: number; onProgress?: (p: MigrationProgress) => Promise<void> | void } = {},
): Promise<MigrationProgress> {
  const batch = opts.batch ?? 50;
  const s = await getSettings();
  const storageChat = s.storage_channel_id;

  const { count: total } = await supabaseAdmin
    .from("movies")
    .select("*", { count: "exact", head: true })
    .is("storage_message_id", null);

  await setMigrationProgress({
    running: true,
    total: total ?? 0,
    started_at: new Date().toISOString(),
    done: 0,
    failed: 0,
    last_id: 0,
  });

  let processed = 0;
  let done = 0;
  let failed = 0;
  let lastId = 0;

  // Loop pages by id ascending.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const cur = await getMigrationProgress();
    if (!cur.running) break;

    const { data: rows, error } = await supabaseAdmin
      .from("movies")
      .select("*")
      .is("storage_message_id", null)
      .gt("id", cur.last_id)
      .order("id", { ascending: true })
      .limit(batch);
    if (error) {
      console.error("[migrate] page", error.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as any as MovieRow[]) {
      const cur2 = await getMigrationProgress();
      if (!cur2.running) break;
      try {
        const caption =
          `🎬 ${row.title}` +
          (row.year ? ` (${row.year})` : "") +
          ` | ${row.language || "N/A"} | ${row.quality || "N/A"}\n` +
          `🆔 db:${row.id} (migrated)`;
        const sent =
          row.file_kind === "document"
            ? await api.sendDocument(storageChat, row.file_id, { caption })
            : await api.sendVideo(storageChat, row.file_id, { caption });
        const mid = sent?.message_id;
        if (mid) {
          await updateMovie(row.id, {
            storage_chat_id: storageChat,
            storage_message_id: mid,
          });
          done++;
        } else {
          failed++;
        }
      } catch (e) {
        console.error("[migrate] row", row.id, (e as Error).message);
        failed++;
      }
      lastId = row.id;
      processed++;
      // Telegram rate-limit cushion
      await new Promise((r) => setTimeout(r, 1100));
      await setMigrationProgress({ last_id: lastId, done, failed });
      if (opts.onProgress && processed % 10 === 0) {
        const p = await getMigrationProgress();
        await opts.onProgress(p);
      }
    }
  }

  await setMigrationProgress({ running: false });
  return await getMigrationProgress();
}

export async function stopMigration(): Promise<void> {
  await setMigrationProgress({ running: false });
}