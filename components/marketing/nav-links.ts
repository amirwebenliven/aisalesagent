export type NavLink = { href: string; label: string; external?: boolean };

export const GITHUB_URL = "https://github.com/amirwebenliven/aisalesagent";

/**
 * One list, rendered by the desktop row and the mobile menu — never two
 * hand-written copies that drift. "Docs" points at the repository README until
 * real documentation exists; a placeholder that goes nowhere reads as broken.
 */
export const NAV_LINKS: NavLink[] = [
  { href: "#how", label: "Product" },
  { href: "#pricing", label: "Pricing" },
  { href: "#compare", label: "Compare" },
  { href: GITHUB_URL, label: "Docs", external: true },
];
