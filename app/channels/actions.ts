"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentOrg } from "@/lib/tenant";
import { connectTelegram, disconnectTelegram, ensureWidgetConnection } from "@/lib/channels";
import { telegramCredentials } from "@/lib/channels/telegram";
import type { ActionState } from "@/components/ui/action-state";

/**
 * Channel mutations.
 *
 * Connecting Telegram is a Route Handler (/api/channels/telegram/connect), not
 * an action here: the bot token needs the same validation whether it arrives
 * from this dashboard or from a script, and duplicating that regex was the
 * worse option. Everything below has no route and belongs here.
 *
 * Nothing in this file deletes a connection. A ChannelConnection cascades to
 * its conversations and their messages, so "disconnect" would silently delete
 * the customer's entire history with those people — pausing stops the channel
 * and keeps the evidence.
 */

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
