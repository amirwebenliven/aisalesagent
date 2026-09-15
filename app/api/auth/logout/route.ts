import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// POST only. A GET logout can be fired by any page that embeds
// <img src="https://app/api/auth/logout">, which logs our users out from
// someone else's site. The session cookie is sameSite=lax, so a cross-site
// form POST does not carry it either.
export async function POST(req: Request) {
  await destroySession();

  // The sidebar signs out with a real <form> POST, so the browser navigates to
  // whatever this returns — JSON would leave the user staring at {"ok":true}.
  // 303 is the status that turns a POST into a GET on the redirect target;
  // 302 lets some clients re-POST to /login.
  if (req.headers.get("accept")?.includes("text/html")) {
    return NextResponse.redirect(new URL("/login", env.APP_URL), 303);
  }

  // fetch()/XHR callers still get JSON.
  return NextResponse.json({ ok: true });
}
