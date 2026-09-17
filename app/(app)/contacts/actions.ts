"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentOrg } from "@/lib/tenant";
import type { ActionState } from "@/components/ui/action-state";

/**
 * Mute the AI for one person.
 *
 * persistInbound checks this flag before handing a message to the agent, so an
 * excluded contact still has their messages recorded — they just never get an
 * automated answer. That is what a customer who asked to speak to a human, or a
 * supplier who is not a lead at all, needs.
 */
export async function setBotExcluded(contactId: string, excluded: boolean): Promise<ActionState> {
  const org = await currentOrg();
  const { count } = await prisma.contact.updateMany({
    where: { id: contactId, organizationId: org.id },
    data: { botExcluded: excluded },
  });
  if (!count) return { ok: false, error: "Contact not found." };

  revalidatePath("/contacts");
  revalidatePath("/chats");
  return { ok: true, message: excluded ? "The AI will not reply to this person." : "The AI can reply again." };
}
