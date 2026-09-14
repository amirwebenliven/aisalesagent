"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { currentOrg } from "@/lib/tenant";
import type { ActionState } from "@/components/ui/action-state";

/**
 * Workspace settings.
 *
 * The BYOK key is write-only: it is encrypted on the way in and never read back
 * out to the browser, not even masked from the real value. The form shows dots
 * that are just dots, and a blank box means "leave whatever is stored alone" —
 * so saving a spend cap cannot accidentally wipe the key.
 */

function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

const Cap = z.coerce.number().positive("The spend cap must be more than zero.").max(10_000);

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const cap = Cap.safeParse(formData.get("dailyCostCapUsd"));
  if (!cap.success) return { ok: false, error: cap.error.issues[0]?.message ?? "Invalid spend cap." };

  const baseUrl = text(formData, "modelBaseUrl");
  if (baseUrl && !z.string().url().safeParse(baseUrl).success) {
    return { ok: false, error: "The provider URL must be a full address, e.g. https://api.openai.com/v1" };
  }

  const apiKey = text(formData, "modelApiKey");
  if (apiKey && /\s/.test(apiKey)) {
    // A key with a space in the middle is a truncated paste, and the failure it
    // causes later is a 401 from the provider that says nothing about why.
    return { ok: false, error: "That key contains a space — check the paste, it is probably incomplete." };
  }
  if (apiKey && apiKey.length < 12) {
    return { ok: false, error: "That key looks too short to be real." };
  }

  const org = await currentOrg();
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      modelChat: text(formData, "modelChat") || null,
      modelUtility: text(formData, "modelUtility") || null,
      modelBaseUrl: baseUrl || null,
      dailyCostCapUsd: cap.data,
      // Blank leaves the stored key untouched. Removing one is a separate,
      // deliberate action.
      ...(apiKey ? { modelApiKeyEnc: encrypt(apiKey), modelProvider: "custom" } : {}),
    },
  });

  revalidatePath("/settings");
  return { ok: true, message: apiKey ? "Saved. Requests now go to your provider on your key." : "Saved." };
}

export async function clearApiKey(): Promise<ActionState> {
  const org = await currentOrg();
  await prisma.organization.update({
    where: { id: org.id },
    data: { modelApiKeyEnc: null, modelProvider: null, modelBaseUrl: null },
  });

  revalidatePath("/settings");
  return { ok: true, message: "Key removed — back on the platform key." };
}
