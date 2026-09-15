"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentOrg } from "@/lib/tenant";
import { connectTelegram, disconnectTelegram, ensureWidgetConnection } from "@/lib/channels";
import { telegramCredentials } from "@/lib/channels/telegram";
import type { ActionState } from "@/components/ui/action-state";

/**
 * Channel mutations.
 *
 * /api/channels/telegram/connect still exists and is unchanged: a token has to
 * validate the same way whether it arrives from a script or from this
 * dashboard. The dashboard goes through the action below instead, because the
 * setup modal needs revalidation of this page in the same round trip and
 * because a mutation reached by fetch() is a mutation with its own auth story.
 * The one duplicated thing is the token shape — deliberately, and it is four
 * characters of regex.
 *
 * Nothing in this file deletes a connection. A ChannelConnection cascades to
 * its conversations and their messages, so "disconnect" would silently delete
 * the customer's entire history with those people — pausing stops the channel
 * and keeps the evidence.
 */

/** What the setup modal renders. `username` is the proof the token reached a bot. */
export type TelegramConnectResult =
  | { ok: true; username: string; agentId: string | null; note: string | null }
  | { ok: false; error: string };

// BotFather format: <numeric id>:<35-char secret>. Catching a mistyped or
// half-pasted token here is worth it — Telegram answers a malformed token with
// "Unauthorized", which reads as "this bot is dead" and sends people back to
// BotFather to make a second one.
const BotToken = z
  .string()
  .trim()
  .regex(/^\d{6,}:[A-Za-z0-9_-]{30,}$/, "That doesn't look like a BotFather token (123456:ABC-…)");

export async function connectTelegramChannel(input: {
  botToken: string;
  agentId?: string | null;
}): Promise<TelegramConnectResult> {
  const token = BotToken.safeParse(input.botToken);
  if (!token.success) {
    return { ok: false, error: token.error.issues.map((i) => i.message).join("; ") };
  }

  // From the session cookie, never from the form. An organizationId in a
  // payload is user input, and this one decides whose bot gets overwritten.
  const org = await currentOrg();

  const agentId = input.agentId?.trim() || null;
  if (agentId) {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, organizationId: org.id },
      select: { id: true },
    });
    if (!agent) return { ok: false, error: "Unknown agent." };
  }

  try {
    const { connection, username } = await connectTelegram({
      organizationId: org.id,
      botToken: token.data,
      agentId,
    });

    revalidatePath("/channels");
    revalidatePath("/");

    return {
      ok: true,
      username,
      agentId: connection.agentId,
      // Not an error: on http APP_URL connectTelegram parks the polling note
      // here, and it is the one thing a local tester has to read.
      note: connection.lastErrorMessage,
    };
  } catch (e) {
    // Telegram's own words — "Unauthorized" means the token, "bad webhook:
    // HTTPS url must be provided" means APP_URL. Collapsing them into "something
    // went wrong" hides which of the two it is.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function pauseChannel(channelId: string): Promise<ActionState> {
  const org = await currentOrg();
  const connection = await prisma.channelConnection.findFirst({
    where: { id: channelId, organizationId: org.id },
  });
  if (!connection) return { ok: false, error: "Channel not found." };

  if (connection.kind === "TELEGRAM") {
    try {
      // Deletes the webhook as well as flipping the row: a paused channel that
      // Telegram is still calling would look off and behave on.
      await disconnectTelegram(connection);
    } catch (e) {
      return { ok: false, error: `Telegram refused the disconnect: ${e instanceof Error ? e.message : String(e)}` };
    }
  } else {
    await prisma.channelConnection.update({ where: { id: connection.id }, data: { status: "PAUSED" } });
  }

  revalidatePath("/channels");
  revalidatePath("/");
  return { ok: true, message: "Paused. Inbound messages are still recorded; the AI will not answer them." };
}

export async function resumeChannel(channelId: string): Promise<ActionState> {
  const org = await currentOrg();
  const connection = await prisma.channelConnection.findFirst({
    where: { id: channelId, organizationId: org.id },
  });
  if (!connection) return { ok: false, error: "Channel not found." };

  if (connection.kind === "TELEGRAM") {
    try {
      // Re-registers the webhook with the stored token. The token is decrypted
      // here and never leaves the server — the client asked to resume, not for
      // the credential.
      const { botToken } = telegramCredentials(connection);
      await connectTelegram({ organizationId: org.id, botToken, agentId: connection.agentId });
    } catch (e) {
      return { ok: false, error: `Telegram refused the reconnect: ${e instanceof Error ? e.message : String(e)}` };
    }
  } else {
    await prisma.channelConnection.update({ where: { id: connection.id }, data: { status: "ACTIVE" } });
  }

  revalidatePath("/channels");
  revalidatePath("/");
  return { ok: true, message: "Live again." };
}

export async function assignAgent(channelId: string, agentId: string): Promise<ActionState> {
  const org = await currentOrg();

  if (agentId) {
    // An agent id from the browser: scoped, or another tenant's agent would end
    // up answering this channel's customers.
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, organizationId: org.id },
      select: { id: true },
    });
    if (!agent) return { ok: false, error: "Unknown agent." };
  }

  const { count } = await prisma.channelConnection.updateMany({
    where: { id: channelId, organizationId: org.id },
    data: { agentId: agentId || null },
  });
  if (!count) return { ok: false, error: "Channel not found." };

  revalidatePath("/channels");
  return { ok: true, message: agentId ? "Agent assigned." : "No agent — inbound messages will wait for a human." };
}

export async function connectWidget(): Promise<ActionState> {
  const org = await currentOrg();
  const agent = await prisma.agent.findFirst({
    where: { organizationId: org.id, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  await ensureWidgetConnection({ organizationId: org.id, agentId: agent?.id ?? null });

  revalidatePath("/channels");
  return { ok: true, message: "Widget ready — copy the snippet into the site's HTML." };
}
