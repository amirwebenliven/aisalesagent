"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: string | number };
type Group = { title?: string; items: Item[] };

export default function Sidebar({
  orgName,
  userEmail,
  credits,
  openChats,
}: {
  orgName: string;
  userEmail: string;
  credits: number;
  openChats: number;
}) {
  const path = usePathname();

  // Only routes that exist. Broadcasts, Appointments, Tasks, Live Data and
  // Automations were listed here before they were built, so every one of them
  // 404'd — a dead link in a nav reads as a broken product, not a roadmap.
  // Add each back the day its page lands.
  const groups: Group[] = [
    { items: [{ href: "/", label: "Dashboard" }] },
    {
      title: "Engage",
      items: [{ href: "/chats", label: "Chats", badge: openChats || undefined }],
    },
    {
      title: "CRM",
      items: [{ href: "/contacts", label: "Contacts" }],
    },
    {
      title: "AI Studio",
      items: [
        { href: "/agents", label: "AI Agents" },
        { href: "/knowledge", label: "Knowledge Base" },
      ],
    },
    {
      title: "Setup",
      items: [
        { href: "/channels", label: "Channels" },
        { href: "/settings", label: "Settings" },
      ],
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="mark" aria-hidden="true">AI</span>
        <span>
          <span className="name">Agent Platform</span>
          <br />
          <span className="org">{orgName}</span>
        </span>
      </div>

      <nav className="nav">
        {groups.map((g, i) => (
          <div key={g.title ?? i}>
            {g.title && <div className="nav-group">{g.title}</div>}
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="nav-item"
                aria-current={isActive(it.href) ? "page" : undefined}
              >
                {it.label}
                {it.badge ? <span className="badge">{it.badge}</span> : null}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <div className="credits">
          <div className="lab">Credits</div>
          <div className="val">{credits.toFixed(2)}</div>
        </div>
        <div className="who" title={userEmail}>{userEmail}</div>
        {/* A real form POST, not fetch(): logout is POST-only (a GET logout
            fires from any <img src> on someone else's page), and a form submit
            follows the redirect and reloads the layout so the new cookie is
            read. A fetch would clear the cookie and leave the stale UI on screen. */}
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="btn" style={{ width: "100%", justifyContent: "center" }}>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
