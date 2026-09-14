import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

// Stateless sessions: a signed JWT in an httpOnly cookie. No session table, so
// nothing to clean up and no DB read on every page — the tradeoff is that a
// token cannot be revoked before it expires, which is why the expiry is 30 days
// and not a year.

export type Session = { userId: string; organizationId: string };

export const SESSION_COOKIE = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// HMAC key = the UTF-8 bytes of the ENCRYPTION_KEY hex string. middleware.ts
// derives the key the SAME way (it cannot import this module — see the note
// there); change one and every existing cookie silently stops verifying.
const secret = new TextEncoder().encode(env.ENCRYPTION_KEY);

/**
 * Mark the cookie Secure only when we are genuinely served over HTTPS.
 *
 * NODE_ENV is the wrong signal: `bun run start` sets it to "production" while
 * still serving http://localhost:3000, so a NODE_ENV check flags the cookie
 * Secure, the browser silently discards it, login returns 200 and the user
 * lands back on the login page with no error anywhere. APP_URL is the honest
 * answer because it is the origin we actually serve from — and it has to be
 * correct regardless, since webhooks are registered against it.
 */
const SECURE_COOKIE = env.APP_URL.startsWith("https://");

export async function signSessionToken(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret);
}

/**
 * Returns null for anything not a valid, unexpired, untampered token. A bad
 * cookie means "logged out", never a 500 — an old cookie signed with a rotated
 * key would otherwise take down every page for that browser.
 */
export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const { userId, organizationId } = payload as Record<string, unknown>;
    if (typeof userId !== "string" || typeof organizationId !== "string") return null;
    return { userId, organizationId };
  } catch {
    return null;
  }
}

/**
 * Write the session cookie. Only callable from a Route Handler or Server Action —
 * Next throws if a Server Component tries to mutate cookies (the response headers
 * are already on their way).
 */
export async function createSession(userId: string, organizationId: string): Promise<void> {
  const token = await signSessionToken({ userId, organizationId });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, // JS can't read it, so an XSS can't exfiltrate the session
    sameSite: "lax", // "strict" would drop the cookie on inbound links from email
    secure: SECURE_COOKIE,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Read the session in a Server Component or Route Handler. Cookie only — no DB hit. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  // Delete AND overwrite with an expired value: some proxies strip a bare
  // Set-Cookie delete, and a session that survives logout is the worst bug here.
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIE,
    path: "/",
    maxAge: 0,
  });
  jar.delete(SESSION_COOKIE);
}
