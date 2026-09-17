"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentOrg } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { conversationRefFrom, sendBubbles } from "@/lib/channels";
import type { ActionState } from "@/components/ui/action-state";

/**
 * Inbox mutations.
 *
 * Every one of these re-derives the organization from the session cookie and
 * puts it in the WHERE. The conversationId arriving from the browser is user
 * input: scoped like this, a guessed id from another tenant reads as "not
 * found" instead of as their customer's thread.
 */

const MAX_REPLY_CHARS = 4000;

const State = z.enum(["AI_ACTIVE", "HUMAN_ACTIVE", "CLOSED"]);

/**
 * Where a reply is delivered. A conversation created by a channel has its
 * provider address encoded in its id (see conversationKey in lib/channels);
 * seeded demo rows are plain cuids with no address behind them, so they persist
 * to the thread and stop there rather than throwing.
 */
function providerAddress(conversationId: string, channelConnectionId: string): string | null {
  try {
    return conversationRefFrom(conversationId, channelConnectionId);
  } catch {
    return null;
  }
}

export async function sendHumanReply(conversationId: string, body: string): Promise<ActionState> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Type a message first." };
  if (text.length > MAX_REPLY_CHARS) {
    return { ok: false, error: `That is ${text.length} characters — the limit is ${MAX_REPLY_CHARS}.` };
  }

  const org = await currentOrg();
  const session = await getSession();

  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: org.id },
    include: { channel: true },
  });
  if (!convo) return { ok: false, error: "Conversation not found." };

  // Persisted BEFORE the provider call, and the handover with it: if Telegram
  // rejects the send, the operator's words are still in the thread and the AI
  // still must not answer on top of a human who has started typing.
  const message = await prisma.message.create({
    data: {
      organizationId: org.id,
      conversationId: convo.id,
      direction: "OUTBOUND",
      body: text,
      aiGenerated: false,
      sentByUserId: session?.userId ?? null,
    },
  });

  await prisma.conversation.update({
    where: { id: convo.id },
    // A human replying pauses the AI on this conversation. That is the rule —
    // runAgentTurn refuses to run against HUMAN_ACTIVE.
    data: { state: "HUMAN_ACTIVE", lastMessageAt: new Date(), closedAt: null },
  });

  const to = providerAddress(convo.id, convo.channelConnectionId);
  let deliveryError: string | null = null;

  if (to) {
    try {
      const [providerId] = await sendBubbles(convo.channel, to, [text]);
      // Outbound ids live in the same @@unique namespace as inbound ones, so
      // recording it is what stops a provider echo landing as a second row.
      if (providerId) {
        await prisma.message.update({ where: { id: message.id }, data: { providerId } });
      }
    } catch (e) {
      deliveryError = e instanceof Error ? e.message : String(e);
      await prisma.channelConnection.update({
        where: { id: convo.channelConnectionId },
        data: { lastErrorAt: new Date(), lastErrorMessage: deliveryError.slice(0, 1000) },
      });
    }
  }

  revalidatePath("/chats");
  revalidatePath("/dashboard");

  if (deliveryError) {
    // The provider's own words. A token that expired and a network blip need
    // different fixes and only the real message distinguishes them.
    return {
      ok: false,
      error: `Saved to the thread, but ${convo.channel.kind.toLowerCase()} delivery failed: ${deliveryError}`,
    };
  }

  return {
    ok: true,
    message: to ? undefined : "Saved. This demo conversation has no live channel to deliver to.",
  };
}

export async function setConversationState(conversationId: string, next: string): Promise<ActionState> {
  const parsed = State.safeParse(next);
  if (!parsed.success) return { ok: false, error: `Unknown state "${next}".` };

  const org = await currentOrg();
  const { count } = await prisma.conversation.updateMany({
    where: { id: conversationId, organizationId: org.id },
    data: {
      state: parsed.data,
      closedAt: parsed.data === "CLOSED" ? new Date() : null,
    },
  });
  if (!count) return { ok: false, error: "Conversation not found." };

  revalidatePath("/chats");
  revalidatePath("/dashboard");

  const message =
    parsed.data === "HUMAN_ACTIVE"
      ? "You own this thread — the AI will not reply."
      : parsed.data === "AI_ACTIVE"
        ? "Handed back to the AI."
        : "Conversation closed.";
  return { ok: true, message };
}
