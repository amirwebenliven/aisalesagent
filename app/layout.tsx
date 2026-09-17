import type { Metadata } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
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

/**
 * The root layout is deliberately minimal: fonts, global CSS, nothing else.
 *
 * It used to look up the session and render the sidebar shell for every route.
 * That coupled the public marketing page and the auth pages to a database
 * read they never needed, and the try/catch that hid the failure is what once
 * made /login unreachable. The shell now lives in app/(app)/layout.tsx, where
 * every route beneath it genuinely requires a session; the marketing chrome
 * lives in app/(marketing)/layout.tsx. Route groups keep the URLs unchanged.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body style={{ fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
