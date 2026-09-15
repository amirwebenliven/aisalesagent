-- Message.providerId was GLOBALLY unique. A provider's id space is only unique
-- within its own connection: in a Telegram private chat, chat.id IS the user's
-- own Telegram id (identical for every bot they message) and message_id
-- restarts low per chat. So the same person messaging two tenants' bots
-- produced the same `tg:<chatId>:<messageId>`, the second insert hit P2002,
-- persistInbound reported "deduped", the webhook answered 200 — and that
-- tenant's customer message was never stored, queued or answered, with no
-- retry because 200 tells the provider we have it.
--
-- conversationId already encodes the connection, so per-conversation is the
-- correct grain: a real redelivery of the same event still collides.
DROP INDEX "Message_providerId_key";

CREATE UNIQUE INDEX "Message_conversationId_providerId_key"
  ON "Message"("conversationId", "providerId");