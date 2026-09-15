/**
 * Ask Telegram directly what it thinks is going on with our bot.
 *
 *   bun scripts/telegram-check.ts
 *
 * Answers the three questions that explain ~every "I messaged it and nothing
 * happened": is the token live, is a webhook registered (which BLOCKS polling),
 * and are there updates waiting that nothing has collected.
 *
 * The token is decrypted to make the calls and never printed.
 */
import { prisma } from "../lib/db";
import { telegramCredentials } from "../lib/channels/telegram";

const API = "https://api.telegram.org/bot";

async function tg<T>(token: string, method: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(json.description ?? `${method} failed`);
  return json.result as T;
}

const connections = await prisma.channelConnection.findMany({
  where: { kind: "TELEGRAM" },
  include: { agent: { select: { name: true, isActive: true } } },
});

if (!connections.length) {
  console.log("\nNo Telegram channel connected.\n");
  process.exit(0);
}

for (const c of connections) {
  console.log(`\n── @${c.externalId} ──`);
  console.log(`  status   ${c.status}`);
  console.log(`  agent    ${c.agent ? `${c.agent.name} (${c.agent.isActive ? "active" : "PAUSED"})` : "NONE"}`);

  if (!c.credentialsEnc) {
    console.log("  no stored credentials");
    continue;
  }

  const { botToken } = telegramCredentials(c);

  try {
    const me = await tg<{ username: string; can_read_all_group_messages?: boolean }>(botToken, "getMe");
    console.log(`  token    valid → @${me.username}`);
  } catch (e) {
    console.log(`  token    REJECTED: ${e instanceof Error ? e.message : e}`);
    continue;
  }

  const hook = await tg<{
    url: string;
    pending_update_count: number;
    last_error_message?: string;
    last_error_date?: number;
  }>(botToken, "getWebhookInfo");

  if (hook.url) {
    console.log(`  webhook  SET → ${hook.url}`);
    console.log(`           This BLOCKS polling. getUpdates returns 409 while a webhook exists.`);
    if (hook.last_error_message) console.log(`           last error: ${hook.last_error_message}`);
  } else {
    console.log(`  webhook  none (correct for polling mode)`);
  }

  console.log(`  pending  ${hook.pending_update_count} update(s) waiting at Telegram`);

  // Peek without consuming: offset -1 returns only the most recent update and
  // does not acknowledge anything, so the worker's poller still gets it.
  try {
    const updates = await tg<Array<Record<string, unknown>>>(botToken, "getUpdates", {
      offset: -1,
      timeout: 0,
    });
    if (!updates.length) {
      console.log(`  latest   (nothing — has anyone messaged the bot?)`);
    } else {
      const u = updates[0] as { update_id: number; message?: { text?: string; from?: { first_name?: string } } };
      const from = u.message?.from?.first_name ?? "?";
      console.log(`  latest   #${u.update_id} from ${from}: "${u.message?.text ?? "(non-text)"}"`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  getUpdates FAILED: ${msg}`);
    if (/conflict/i.test(msg)) {
      console.log(`           Something else is polling this bot, or a webhook is still set.`);
    }
  }

  const stored = await prisma.message.count({ where: { conversation: { channelConnectionId: c.id } } });
  console.log(`  stored   ${stored} message(s) in our database for this channel`);
}

console.log();
await prisma.$disconnect();
