export type NavLink = { href: string; label: string; external?: boolean };

export const GITHUB_URL = "https://github.com/amirwebenliven/aisalesagent";

/**
 * One list, rendered by the desktop row and the mobile menu — never two
 * hand-written copies that drift. "Docs" points at the repository README until
 * real documentation exists; a placeholder that goes nowhere reads as broken.
 * No "Compare" entry: the public site promotes this product only (CLAUDE.md §16).
 */
export const NAV_LINKS: NavLink[] = [
  { href: "#demo", label: "See it work" },
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: GITHUB_URL, label: "Docs", external: true },
];
