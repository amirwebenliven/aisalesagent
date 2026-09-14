import type { Metadata } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { currentOrg, currentUserEmail, creditBalance } from "@/lib/tenant";
import "./globals.css";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agent Platform",
  description: "Omnichannel AI sales agent",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let shell: { org: string; email: string; credits: number; open: number } | null = null;

  try {
    const org = await currentOrg();
    const [email, credits, open] = await Promise.all([
      currentUserEmail(org.id),
      creditBalance(org.id),
      prisma.conversation.count({ where: { organizationId: org.id, state: { not: "CLOSED" } } }),
    ]);
    shell = { org: org.name, email, credits, open };
  } catch {
    // No session (or no database yet). Fall through WITHOUT the sidebar —
    // never instead of {children}. Rendering a placeholder here instead of the
    // page is what made /login and /signup unreachable in production: the only
    // pages that can fix a missing session were hidden behind the missing
    // session. The chrome is optional; the page never is.
  }

  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body style={{ fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif" }}>
        {shell ? (
          <div className="shell">
            <Sidebar
              orgName={shell.org}
              userEmail={shell.email}
              credits={shell.credits}
              openChats={shell.open}
            />
            <div className="main">{children}</div>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
