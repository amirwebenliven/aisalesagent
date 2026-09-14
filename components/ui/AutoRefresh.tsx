"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-runs the Server Component that rendered the page, on an interval.
 *
 * Used where the data changes without the user doing anything: an inbound
 * message arriving on a channel, or a crawl finishing in the background. It is
 * a poll rather than a socket because there is nothing to subscribe to yet —
 * `after()` runs the crawl in this same process and writes to the row.
 *
 * Skipped while the tab is hidden: a backgrounded dashboard polling every three
 * seconds is a database query per visitor per tick, for a page nobody is
 * looking at.
 */
export default function AutoRefresh({ everyMs = 10_000, active = true }: { everyMs?: number; active?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [active, everyMs, router]);

  return null;
}
