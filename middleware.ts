import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Middleware runs on the EDGE runtime, so it cannot import lib/session.ts:
// that pulls in lib/env.ts (parses the whole process.env object, which is not
// enumerable at the edge) and next/headers. Hence the duplicated verify below —
// it must match verifySessionToken() exactly, key derivation included.
const KEY = process.env.ENCRYPTION_KEY;
if (!KEY) {
  // Loud, because the quiet version of this is unfixable from the outside: with
  // an empty secret every cookie fails to verify, so a correct login succeeds
  // and then bounces straight back to /login with no error anywhere.
  throw new Error("ENCRYPTION_KEY is not set — middleware cannot verify sessions.");
}
const secret = new TextEncoder().encode(KEY);

const SESSION_COOKIE = "session";

// Everything a logged-out visitor legitimately hits. Webhooks and the widget are
// public by design — they are called by Telegram/Meta/a customer's website, which
// will never carry our cookie; redirecting them to /login would return 307+HTML
// to a provider that reads it as a delivery failure and retries forever.
// /api/health is here too: a load balancer's probe carries no cookie, and a 307
// to /login reads as "unhealthy" — the box gets pulled out of rotation.
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/api/auth",
  "/api/webhooks",
  "/api/widget",
  "/api/health",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Same rule as lib/tenant.ts devFallbackAllowed() — kept in sync by hand because
// of the edge-import constraint above. Without this the seeded demo would be
// unreachable in dev until someone signs up.
function devFallbackAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return process.env.ALLOW_DEV_FALLBACK === "1";
  return true;
}

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return typeof payload.userId === "string" && typeof payload.organizationId === "string";
  } catch {
    return false; // expired or tampered — treat as logged out, never as an error
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const signedIn = await hasValidSession(req);

  if (isPublic(pathname)) {
    // An already-signed-in user landing on the auth pages goes to the app.
    if (signedIn && (pathname === "/login" || pathname === "/signup")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (signedIn || devFallbackAllowed()) return NextResponse.next();

  // An API call gets a 401 it can read. Redirecting a fetch() to /login makes it
  // follow the hop and hand the caller a 200 full of HTML, so the error surfaces
  // as "Unexpected token <" somewhere far away from the real cause.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const url = new URL("/login", req.url);
  // Path only — never the query string, which can carry an email or a token and
  // would then sit in our own redirect URL, in history and in the referrer.
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next's build output, the favicon, and anything with a file extension —
  // static assets must not pay for a JWT verify, and a redirect on a .css would
  // serve HTML with a stylesheet content-type.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|svg|webp|ico|css|js|map|txt|xml|woff2?|ttf|mp4)$).*)",
  ],
};
