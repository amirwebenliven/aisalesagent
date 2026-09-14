import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export const runtime = "nodejs";

// POST only. A GET logout can be fired by any page that embeds
// <img src="https://app/api/auth/logout">, which logs our users out from
// someone else's site. The session cookie is sameSite=lax, so a cross-site
// form POST does not carry it either.
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
