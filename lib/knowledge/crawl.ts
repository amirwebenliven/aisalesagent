import * as cheerio from "cheerio";

/**
 * Site crawler for the knowledge base.
 *
 * A SNAPSHOT, not a live link (CLAUDE.md §7) — this runs once per ingest and the
 * agent never fetches the customer's site at reply time.
 *
 * Everything here is bounded on purpose: page count, depth, per-request timeout
 * AND total wall clock. A crawl is kicked off by a human pressing a button and
 * then runs unattended; without a wall-clock cap a site with a calendar widget
 * (infinite ?month=… links) keeps us busy until the process dies.
 */

export interface CrawledPage {
  url: string;
  title: string;
  text: string;
  /**
   * ONE image that is the page's subject — a product's photo — or absent.
   * Never a guess: a listing page with thirty product photos gets none,
   * because a wrong photo on every FAQ from that page is worse than no photo.
   */
  imageUrl?: string;
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  /** Per-request timeout. One slow page must not eat the whole budget. */
  requestTimeoutMs?: number;
  /** Total wall clock for the entire crawl, including robots + sitemap. */
  maxMs?: number;
  concurrency?: number;
}

export interface CrawlResult {
  pages: CrawledPage[];
  /** How the URL list was found — surfaced so "only 1 page" is diagnosable. */
  discovery: "sitemap" | "links";
  /** url → reason. Kept for diagnosis; a bad page never aborts the crawl. */
  skipped: { url: string; reason: string }[];
  stoppedBy: "complete" | "maxPages" | "timeout";
}

const UA = "DMChampKnowledgeBot/0.1 (+website knowledge-base ingest)";
const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";

/** Below this a page is boilerplate (a bare image gallery, a redirect stub). */
const MIN_TEXT_CHARS = 200;
/** Bound memory: 40 pages × this is what we hold at once. */
const MAX_TEXT_CHARS = 20_000;
const MAX_HTML_BYTES = 3_000_000;

/** An <img> alt must share this many real words with the title/h1 to count as the page's photo. */
const MIN_ALT_OVERLAP = 2;
/** width/height attributes below this are thumbnails, swatches and tracking pixels. */
const TINY_IMAGE_PX = 100;
/** The same image on more pages than this is site furniture, not any page's subject. */
const MAX_PAGES_PER_IMAGE = 2;
/** In src, alt or class — chrome, not content. */
const DECORATIVE_IMAGE = /logo|icon|sprite|avatar|placeholder|badge/i;
/** In preference order: a site that sets these has already chosen the page's picture. */
const META_IMAGE_SELECTORS = [
  'meta[property="og:image"]',
  'meta[property="og:image:secure_url"]',
  'meta[name="og:image"]',
  'meta[name="twitter:image"]',
  'meta[name="twitter:image:src"]',
  'meta[property="twitter:image"]',
];

// Extension filter is the cheap first pass; Content-Type is the authoritative
// second one (plenty of HTML pages have no extension at all).
const NON_HTML_EXT =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|css|js|mjs|cjs|json|zip|gz|tgz|bz2|xz|rar|7z|mp3|wav|ogg|m4a|mp4|m4v|avi|mov|wmv|webm|mkv|doc|docx|xls|xlsx|ppt|pptx|odt|ods|rtf|csv|tsv|woff2?|ttf|otf|eot|dmg|exe|msi|apk|deb|rpm|iso|epub)$/i;

/**
 * Reject URLs that point back at our own infrastructure. A tenant types the URL
 * and we fetch it server-side, so without this the crawl endpoint is an SSRF
 * proxy into the metadata service and anything else on the private network.
 * Hostname-literal only: this does not defeat a hostname that RESOLVES to a
 * private address (DNS rebinding) — that needs a resolve-then-connect check.
 */
export function assertCrawlableUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error(`Not a valid URL: ${raw}`);
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Only http and https URLs can be crawled (got ${u.protocol})`);
  }

  // Local addresses are how you test the crawler against your own dev server,
  // so they are only blocked where it matters.
  if (process.env.NODE_ENV === "production" && isPrivateHost(u.hostname)) {
    throw new Error(`Refusing to crawl a private or local address: ${u.hostname}`);
  }

  return u;
}

export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (h === "::1" || h === "0.0.0.0" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) {
    return true;
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) || // cloud metadata
    a === 0
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// robots.txt
// ─────────────────────────────────────────────────────────────────────────────

interface Rule {
  re: RegExp;
  len: number;
}
interface Robots {
  allow: Rule[];
  disallow: Rule[];
  sitemaps: string[];
}

/** `*` is a wildcard, a trailing `$` anchors the end. Matched against path+query. */
function ruleToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

async function fetchRobots(origin: string, timeoutMs: number): Promise<Robots> {
  const robots: Robots = { allow: [], disallow: [], sitemaps: [] };

  let body: string;
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, timeoutMs, "text/plain,*/*;q=0.5");
    // No robots.txt (or a server error fetching it) means no restrictions. The
    // spec's "5xx = disallow everything" would block ingest of a site whose
    // owner is sitting in our dashboard asking us to read it.
    if (!res.ok) return robots;
    body = (await res.text()).slice(0, 500_000);
  } catch {
    return robots;
  }

  // Only groups addressed to `*` or to us apply. A group starts at its first
  // User-agent line; consecutive User-agent lines share one group of rules.
  let applies = false;
  let inGroup = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "sitemap") {
      if (value) robots.sitemaps.push(value);
      continue;
    }

    if (field === "user-agent") {
      if (inGroup) {
        // First agent line after a rule line = a new group.
        applies = false;
        inGroup = false;
      }
      const token = value.toLowerCase();
      // `token &&` matters: a bare "User-agent:" would otherwise match us via
      // startsWith(""), and its rules would apply to a crawler they never named.
      if (token === "*" || (token && UA.toLowerCase().startsWith(token.split("/")[0]!))) applies = true;
      continue;
    }

    if (field !== "allow" && field !== "disallow") continue;
    inGroup = true;
    if (!applies) continue;
    // `Disallow:` with an empty value means "nothing is disallowed" — a rule of
    // zero length here would otherwise match every path and block the site.
    if (!value) continue;
    const rule = { re: ruleToRegex(value), len: value.length };
    (field === "allow" ? robots.allow : robots.disallow).push(rule);
  }

  return robots;
}

/** Longest matching rule wins; Allow wins ties. */
function robotsAllows(robots: Robots, u: URL): boolean {
  const path = u.pathname + u.search;
  let longestDisallow = -1;
  let longestAllow = -1;
  for (const r of robots.disallow) if (r.re.test(path) && r.len > longestDisallow) longestDisallow = r.len;
  for (const r of robots.allow) if (r.re.test(path) && r.len > longestAllow) longestAllow = r.len;
  return longestDisallow < 0 || longestAllow >= longestDisallow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetching & extraction
// ─────────────────────────────────────────────────────────────────────────────

function fetchWithTimeout(url: string, ms: number, accept: string): Promise<Response> {
  return fetch(url, {
    headers: { "user-agent": UA, accept },
    redirect: "follow",
    signal: AbortSignal.timeout(ms),
  });
}

/** Same URL, same key — so a page linked as `/about`, `/about/` and `/about#team` is fetched once. */
function canonical(u: URL): string {
  const c = new URL(u.href);
  c.hash = "";
  c.username = "";
  c.password = "";
  for (const k of [...c.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_cid|mc_eid|ref|source)$/i.test(k)) c.searchParams.delete(k);
  }
  c.searchParams.sort();
  if (c.pathname.length > 1 && c.pathname.endsWith("/")) c.pathname = c.pathname.replace(/\/+$/, "");
  return c.href;
}

/**
 * Main content only. cheerio's `.text()` concatenates without separators, so
 * "HomeAbout usContact" is what you get from a nav — hence the explicit newline
 * injection before extraction, and dropping the chrome elements entirely.
 */
export function extractContent(
  html: string,
  url: string,
): { title: string; text: string; imageUrl?: string } {
  const $ = cheerio.load(html);

  // Read BEFORE the chrome goes: many themes put the page's <h1> inside a
  // <header class="page-header">, and it is the best name we have for matching
  // an image to the page below.
  const h1 = $("h1").first().text();

  $(
    "script, style, noscript, template, svg, iframe, nav, header, footer, aside, form, " +
      "[role=navigation], [role=banner], [role=contentinfo], [aria-hidden=true], " +
      ".nav, .navbar, .menu, .sidebar, .cookie, .cookie-banner, .breadcrumb, .skip-link",
  ).remove();

  const title = ($("title").first().text() || $("h1").first().text() || new URL(url).pathname).trim();

  // After the chrome is stripped (so a header logo can never be a candidate)
  // and before the newline injection below rewrites the tree.
  const imageUrl = pickPageImage($, url, h1, title);

  $("br").replaceWith("\n");
  $("p, div, section, article, li, tr, td, th, h1, h2, h3, h4, h5, h6, blockquote, pre, dt, dd").append("\n");

  const main = $("main").first();
  const article = $("article").first();
  const root = main.length ? main : article.length ? article : $("body");

  const text = root
    .text()
    .replace(/[ \t ​]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  return { title: title.replace(/\s+/g, " ").slice(0, 300), text, imageUrl };
}

/**
 * ONE image that IS the page's subject, or nothing.
 *
 * The <img> whose alt text names the page comes first — matches the h1 (or, with
 * no h1, the title's own segment) exactly, or shares two or more real words with
 * it. Then the social-card tags. That order is deliberate: og:image is very
 * often a site-wide default set once in the layout (Next.js `openGraph.images`,
 * Yoast's fallback card), and on a shop with one default card every product
 * page would carry the same picture — dropSiteWideImages then clears them all,
 * and the product photo that was sitting in the page was never looked at. An
 * alt that matches the page name is the page telling us what it shows.
 *
 * The alt rule is also what keeps a listing page empty: its thirty product
 * photos are all genuine, and none of them is called "Shop". Every doubt here
 * resolves to `undefined`, because a photo the agent sends that is not what the
 * customer asked about costs more trust than no photo.
 *
 * The h1 is the page naming itself. The <title> also carries the site name
 * ("Shop | IZHAANA Enterprises"), and on a listing page those two brand words
 * would match every product alt that mentions the brand — so when there is no
 * h1 only the title's FIRST segment is used, never the site-name tail.
 */
function pickPageImage($: cheerio.CheerioAPI, pageUrl: string, h1: string, title: string): string | undefined {
  const named = pickNamedImage($, pageUrl, h1, title);
  if (named) return named;

  for (const sel of META_IMAGE_SELECTORS) {
    const src = resolveImageUrl($(sel).first().attr("content"), pageUrl);
    if (src && !looksDecorative(src, "", "")) return src;
  }
  return undefined;
}

/** The first content <img> whose alt text names the page — see pickPageImage. */
function pickNamedImage($: cheerio.CheerioAPI, pageUrl: string, h1: string, title: string): string | undefined {
  const candidates = (h1.trim() ? [h1] : title.split(/\s*[|»·]\s*/).slice(0, 1))
    .map((n) => n.trim())
    .filter(Boolean);
  const exact = new Set(candidates.map(normaliseName).filter(Boolean));
  const wordSets = candidates.map(nameWords).filter((w) => w.size > 0);
  if (!wordSets.length && !exact.size) return undefined;

  const main = $("main").first();
  const article = $("article").first();
  const root = main.length ? main : article.length ? article : $("body");

  for (const el of root.find("img").toArray()) {
    const img = $(el);
    const alt = (img.attr("alt") ?? "").trim();
    if (!alt) continue; // nothing ties an unlabelled image to this page
    if (isTiny(img.attr("width")) || isTiny(img.attr("height"))) continue;

    // Lazy-loading themes leave `src` empty or pointing at a 1px stub and put
    // the real file in data-src or srcset; any candidate of the set unwraps to
    // the same original.
    const raw =
      img.attr("src") ||
      img.attr("data-src") ||
      img.attr("data-lazy-src") ||
      firstSrcsetUrl(img.attr("srcset") || img.attr("data-srcset"));
    const src = resolveImageUrl(raw, pageUrl);
    if (!src || looksDecorative(src, alt, img.attr("class") ?? "")) continue;

    if (exact.has(normaliseName(alt))) return src;
    const altWords = nameWords(alt);
    if (wordSets.some((ws) => overlapCount(altWords, ws) >= MIN_ALT_OVERLAP)) return src;
  }

  return undefined;
}

/**
 * Absolute http(s) URL for an image reference, or undefined. Relative paths
 * resolve against the page; inline data: URIs and anything that is not a web
 * URL are dropped — a chat channel has to fetch this by URL later.
 */
function resolveImageUrl(raw: string | undefined, pageUrl: string): string | undefined {
  const s = (raw ?? "").trim();
  if (!s || /^data:/i.test(s)) return undefined;
  let u: URL;
  try {
    u = unwrapImageOptimizer(new URL(s, pageUrl));
  } catch {
    return undefined;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
  // The stored URL is fetched later by the WhatsApp bridge from INSIDE our
  // Docker network. assertCrawlableUrl guards only the start URL; a page the
  // tenant controls can point og:image at 169.254.169.254 or an internal host,
  // and unwrapImageOptimizer would hand over an inner private URL just as
  // readily. Not gated on NODE_ENV — there is no development reason to attach a
  // private image to a customer's FAQ. Default ports only, for the same reason.
  if (isPrivateHost(u.hostname) || u.port !== "") return undefined;
  u.hash = "";
  return u.href;
}

/**
 * Image optimisers wrap the real file: Next.js serves
 * `/_next/image?url=<encoded original>&w=3840&q=75`, and most CDN proxy modes
 * take the same `url=` parameter. The wrapper answers only on the site's own
 * host, at a width negotiated for one screen — the original is what WhatsApp
 * or Telegram can actually fetch. Unwrapped repeatedly because optimisers get
 * chained (a site proxy in front of a CDN proxy); three is plenty.
 */
function unwrapImageOptimizer(u: URL): URL {
  for (let i = 0; i < 3; i++) {
    const inner = u.searchParams.get("url"); // already percent-decoded
    if (!inner) break;
    // An arbitrary URL's `url=` is trusted only when it is plainly a URL. Next's
    // own endpoint is also allowed a site-relative path ("/images/a.jpg"),
    // which it serves from its own origin.
    const isNext = u.pathname.includes("/_next/image");
    if (!/^https?:\/\//i.test(inner) && !(isNext && inner.startsWith("/"))) break;
    try {
      u = new URL(inner, u.origin);
    } catch {
      break;
    }
  }
  return u;
}

/** `src` must already be an absolute http(s) URL (see resolveImageUrl). */
function looksDecorative(src: string, alt: string, cls: string): boolean {
  const u = new URL(src);
  if (u.pathname.toLowerCase().endsWith(".svg")) return true;
  // Path and query only, not the host: a shop at silicon-something.com must not
  // lose every photo it has to the word "icon".
  return DECORATIVE_IMAGE.test(`${u.pathname}${u.search} ${alt} ${cls}`);
}

function isTiny(attr: string | undefined): boolean {
  const n = Number.parseFloat(attr ?? ""); // "100%" → 100, "auto" → NaN: neither is tiny
  return Number.isFinite(n) && n > 0 && n < TINY_IMAGE_PX;
}

function firstSrcsetUrl(srcset: string | undefined): string | undefined {
  return srcset?.split(",")[0]?.trim().split(/\s+/)[0] || undefined;
}

/** Lowercased, punctuation collapsed to single spaces — for exact comparison. */
function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Words worth counting as overlap: three letters or more, and not glue. */
function nameWords(s: string): Set<string> {
  return new Set(
    normaliseName(s)
      .split(" ")
      .filter((w) => w.length >= 3 && !NAME_GLUE.has(w)),
  );
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

const NAME_GLUE = new Set(["the", "and", "for", "with", "from", "our", "your", "this", "that"]);

// ─────────────────────────────────────────────────────────────────────────────
// Sitemap
// ─────────────────────────────────────────────────────────────────────────────

async function readSitemap(url: string, timeoutMs: number): Promise<{ urls: string[]; indexes: string[] }> {
  const res = await fetchWithTimeout(url, timeoutMs, "application/xml,text/xml,*/*;q=0.5");
  if (!res.ok) return { urls: [], indexes: [] };
  const xml = (await res.text()).slice(0, 5_000_000);
  const $ = cheerio.load(xml, { xmlMode: true });

  const locs = $("loc")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  // A sitemap index lists other sitemaps, not pages.
  const isIndex = $("sitemapindex").length > 0;
  return isIndex ? { urls: [], indexes: locs } : { urls: locs, indexes: [] };
}

async function collectSitemapUrls(
  origin: string,
  robots: Robots,
  limit: number,
  timeoutMs: number,
  deadline: number,
): Promise<string[]> {
  // The conventional location is ALWAYS tried, even when robots.txt declares a
  // Sitemap line: that line routinely points at a CDN host or the www variant,
  // and dropping to a link crawl because of it loses the site owner's own list.
  const seeds = [...robots.sitemaps, `${origin}/sitemap.xml`];
  const out: string[] = [];
  const queue = [...new Set(seeds.filter((s) => safeOrigin(s) === origin))].slice(0, 5);
  let indexesFollowed = 0;

  while (queue.length && out.length < limit && Date.now() < deadline) {
    const next = queue.shift()!;
    // .gz sitemaps need gunzipping that fetch won't do for us; BFS covers them.
    if (next.endsWith(".gz")) continue;
    let got: { urls: string[]; indexes: string[] };
    try {
      got = await readSitemap(next, timeoutMs);
    } catch {
      continue; // a missing or malformed sitemap just means we fall back to BFS
    }
    for (const u of got.urls) {
      if (out.length >= limit) break; // a big site's sitemap is tens of thousands of <loc>
      if (safeOrigin(u) === origin) out.push(u);
    }
    if (indexesFollowed < 5) {
      for (const child of got.indexes.slice(0, 5 - indexesFollowed)) {
        queue.push(child);
        indexesFollowed++;
      }
    }
  }

  return out;
}

function safeOrigin(u: string): string | null {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The crawl
// ─────────────────────────────────────────────────────────────────────────────

export async function crawlSite(startUrl: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? 40, 500));
  const maxDepth = Math.max(0, opts.maxDepth ?? 2);
  const requestTimeoutMs = opts.requestTimeoutMs ?? 10_000;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 8));
  const deadline = Date.now() + (opts.maxMs ?? 60_000);

  const start = assertCrawlableUrl(startUrl);
  const origin = start.origin;

  const robots = await fetchRobots(origin, Math.min(requestTimeoutMs, 5_000));

  // Sitemap first — it is the site owner's own list of what matters, and it
  // skips the whole link-graph problem.
  const sitemapUrls = await collectSitemapUrls(origin, robots, maxPages * 3, requestTimeoutMs, deadline);

  // One stray <loc> is not a usable sitemap; fall back to following links so a
  // site with a stub sitemap still gets crawled properly.
  const useSitemap = sitemapUrls.length >= 2;
  const discovery: CrawlResult["discovery"] = useSitemap ? "sitemap" : "links";

  const seen = new Set<string>();
  const queue: { url: string; depth: number }[] = [];
  const skipped: CrawlResult["skipped"] = [];
  const pages: CrawledPage[] = [];
  let stoppedBy: CrawlResult["stoppedBy"] = "complete";

  const enqueue = (raw: string, depth: number) => {
    let u: URL;
    try {
      u = new URL(raw, start.href);
    } catch {
      return;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return;
    if (u.origin !== origin) return; // same origin only, always
    if (NON_HTML_EXT.test(u.pathname)) return;
    const key = canonical(u);
    if (seen.has(key)) return;
    if (!robotsAllows(robots, u)) {
      seen.add(key);
      skipped.push({ url: key, reason: "robots.txt disallow" });
      return;
    }
    seen.add(key);
    queue.push({ url: key, depth });
  };

  if (useSitemap) {
    for (const u of sitemapUrls) enqueue(u, maxDepth); // at maxDepth: listed, not expanded
  } else {
    enqueue(start.href, 0);
    if (canonical(start) !== canonical(new URL(origin))) enqueue(origin, 0);
    for (const u of sitemapUrls) enqueue(u, 0);
  }

  let active = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (pages.length >= maxPages) {
        stoppedBy = "maxPages";
        return;
      }
      if (Date.now() >= deadline) {
        stoppedBy = "timeout";
        return;
      }

      const job = queue.shift();
      if (!job) {
        // Another worker may still be about to enqueue links from its page.
        if (active === 0) return;
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }

      active++;
      try {
        const visited = await visit(job.url, requestTimeoutMs);
        if (visited.page) {
          if (pages.length < maxPages) pages.push(visited.page);
        } else if (visited.reason) {
          skipped.push({ url: job.url, reason: visited.reason });
        }
        // A thin page still earns its links — a bare index page is often the
        // only route to the content.
        if (!useSitemap && job.depth < maxDepth) {
          for (const link of visited.links) enqueue(link, job.depth + 1);
        }
      } catch (e) {
        // One bad page never aborts a crawl — a 40-page site with one broken
        // route is still 39 pages of knowledge.
        skipped.push({ url: job.url, reason: e instanceof Error ? e.message : String(e) });
      } finally {
        active--;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  return { pages: dropSiteWideImages(pages.slice(0, maxPages)), discovery, skipped, stoppedBy };
}

/**
 * An image on more than MAX_PAGES_PER_IMAGE pages is site furniture — a default
 * og:image, a banner, the "featured product" every page shows — not any of
 * those pages' subject. Extraction sees one page at a time and cannot tell;
 * the crawl can. Dropping it costs at most one photo per page; keeping it puts
 * the wrong photo on every FAQ from every one of them.
 */
export function dropSiteWideImages(pages: CrawledPage[]): CrawledPage[] {
  const pagesPerImage = new Map<string, number>();
  for (const p of pages) {
    if (p.imageUrl) pagesPerImage.set(p.imageUrl, (pagesPerImage.get(p.imageUrl) ?? 0) + 1);
  }
  return pages.map((p) =>
    p.imageUrl && (pagesPerImage.get(p.imageUrl) ?? 0) > MAX_PAGES_PER_IMAGE ? { ...p, imageUrl: undefined } : p,
  );
}

interface Visit {
  page?: CrawledPage;
  /** Why no page came back. Absent when one did. */
  reason?: string;
  links: string[];
}

async function visit(url: string, timeoutMs: number): Promise<Visit> {
  const res = await fetchWithTimeout(url, timeoutMs, HTML_ACCEPT);
  if (!res.ok) return { reason: `HTTP ${res.status}`, links: [] };

  // A redirect can land off-origin (an aggressive www/CDN rule, a shortened link
  // in the sitemap); the FINAL url is the one the same-origin rule applies to.
  const finalUrl = new URL(res.url || url);
  if (finalUrl.origin !== new URL(url).origin) {
    return { reason: `redirected off-origin to ${finalUrl.origin}`, links: [] };
  }

  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
    return { reason: `not HTML (${type.split(";")[0] || "unknown"})`, links: [] };
  }

  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_HTML_BYTES) return { reason: `too large (${length} bytes)`, links: [] };

  const html = (await res.text()).slice(0, MAX_HTML_BYTES);
  const { title, text, imageUrl } = extractContent(html, finalUrl.href);

  const $ = cheerio.load(html);
  const links = $("a[href]")
    .map((_, el) => $(el).attr("href") ?? "")
    .get()
    .filter((h) => h && !h.startsWith("#") && !/^(mailto|tel|javascript|data):/i.test(h));

  if (text.length < MIN_TEXT_CHARS) return { reason: `only ${text.length} chars of text`, links };

  return { page: { url: finalUrl.href, title, text, imageUrl }, links };
}
