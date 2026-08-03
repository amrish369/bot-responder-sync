## Auto-delete fix plan

Current checks confirm:
- Auto-delete is enabled with a 180-second timer.
- The queue runner cron executes every minute and receives HTTP 200.
- The queue is currently empty, so messages are not being reliably queued.
- Multi-bot webhook routes create a bot using its token, but queue rows are written with `bot_id = null`; deletion can therefore run with the wrong bot token.
- The outgoing grammY API transformer treats its returned message as a raw `{ ok, result }` response, so sent text/files/videos are not consistently detected and queued.

### Implementation
1. **Carry bot identity through the full flow**
   - Change `createBot` to accept the database bot ID.
   - Pass that ID from `/telegram/webhook/$botId`.
   - Resolve the active bot ID for the legacy webhook route.
   - Store the correct `bot_id` on every incoming and outgoing delete-queue row.

2. **Fix outgoing message capture**
   - Read grammY transformer results in their actual shape for `sendMessage`, photos, videos, documents, audio, stickers, forwarded/copied messages, and media groups.
   - Queue every returned `message_id`, while continuing to exclude only the configured storage channel.

3. **Fix incoming deletion coverage**
   - Queue user and admin messages in private chats, groups, and supergroups.
   - Cover regular and edited messages without blocking bot command processing.
   - Keep the configured 3-minute timer for both incoming and outgoing messages.

4. **Harden the queue runner**
   - Use the row’s exact bot token for deletion.
   - Do not silently discard rows when the bot identity/token is temporarily unavailable.
   - Record Telegram error codes/descriptions, retry transient errors, and remove only successful or genuinely non-retryable rows.
   - Process rows independently so one failure cannot stop the batch.

5. **Add focused tests and production verification**
   - Test queue creation for private/group incoming messages and all outgoing media types.
   - Test correct token selection with multiple bots.
   - Test retries and fatal Telegram responses.
   - Verify the live queue receives rows, the scheduled runner consumes them, and messages disappear from both a personal chat and a group after the configured delay.

### Telegram constraint
Group deletion requires that the specific bot handling that group is an admin with permission to delete messages. The fix will report this permission failure clearly instead of silently losing the queue item.