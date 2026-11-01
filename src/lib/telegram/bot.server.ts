async function withBackupKb(
  kb?: InlineKeyboard | null,
  movieId?: number,
): Promise<InlineKeyboard | undefined> {
  const backup = await backupGroupKb();
  let extra: InlineKeyboard | null = backup;
  if (movieId) {
    const instagram = new InlineKeyboard().url("📸 Instagram ID", INSTAGRAM_URL);
    extra = extra ? mergeKeyboards(extra, instagram) : instagram;
  }
  if (!extra) return kb ?? undefined;
  if (!kb) return extra;
  return mergeKeyboards(kb, extra);
}
