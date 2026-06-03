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

  // Remaining legacy movies (recomputed every invocation so admins see progress).
  const { count: remaining } = await supabaseAdmin
    .from("movies")
    .select("*", { count: "exact", head: true })
    .is("storage_message_id", null);

  const prior = await getMigrationProgress();
  // Preserve cumulative counters across invocations so admins see real totals.
  let done = prior.done ?? 0;
  let failed = prior.failed ?? 0;
  const total = (done + failed) + (remaining ?? 0);

  await setMigrationProgress({
    running: true,
    total,
    started_at: prior.started_at ?? new Date().toISOString(),
    done,
    failed,
    last_id: prior.last_id ?? 0,
  });

  console.log(
    `[migrate] starting batch — storageChat=${storageChat} remaining=${remaining ?? 0} ` +
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
    .order("id", { ascending: true })
    .limit(batch);

  if (error) {
    console.error("[migrate] page error:", error.message);
    await setMigrationProgress({ running: false });
    return await getMigrationProgress();
  }

  if (!rows || rows.length === 0) {
    console.log("[migrate] nothing left to migrate");
    await setMigrationProgress({ running: false });
    return await getMigrationProgress();
  }

  console.log(`[migrate] processing ${rows.length} legacy movie(s)`);

  let lastId = prior.last_id ?? 0;
  const failedIds: number[] = [];

  for (const row of rows as any as MovieRow[]) {
    const cur2 = await getMigrationProgress();
    if (!cur2.running) {
      console.log("[migrate] stop requested, halting batch");
      break;
    }
    console.log(
      `[migrate] -> id=${row.id} kind=${row.file_kind} title=${JSON.stringify(row.title)}`,
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
        console.warn(
          `[migrate] id=${row.id} ${primary} failed: ${(e1 as Error).message} — trying ${fallback}`,
        );
        try {
          sent = await (api as any)[fallback](storageChat, row.file_id, { caption });
        } catch (e2) {
          lastErr = e2;
          console.error(
            `[migrate] id=${row.id} ${fallback} also failed: ${(e2 as Error).message}`,
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
        console.log(`[migrate] id=${row.id} archived as msg=${mid}`);
      } else {
        failed++;
        failedIds.push(row.id);
        console.error(
          `[migrate] id=${row.id} FAILED — telegram error: ${(lastErr as Error)?.message ?? "unknown"}`,
        );
      }
    } catch (e) {
      failed++;
      failedIds.push(row.id);
      console.error(`[migrate] id=${row.id} unexpected: ${(e as Error).message}`);
    }
    lastId = row.id;
    await new Promise((r) => setTimeout(r, sleepMs));
    await setMigrationProgress({ last_id: lastId, done, failed });
  }

  await setMigrationProgress({ running: false, last_id: lastId, done, failed });
  const final = await getMigrationProgress();
  console.log(
    `[migrate] batch finished — done=${final.done} failed=${final.failed} remaining≈${
      (remaining ?? 0) - rows.length + failedIds.length
    } failedIds=[${failedIds.join(",")}]`,
  );
  if (opts.onProgress) await opts.onProgress(final);
  return final;
}

export async function stopMigration(): Promise<void> {
  await setMigrationProgress({ running: false });
}