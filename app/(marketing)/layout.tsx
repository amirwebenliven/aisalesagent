import { getSession } from "@/lib/session";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import "./marketing.css";

/**
 * Public pages: nav + footer, no sidebar, no database. The only thing read
 * here is the session cookie (a signature check, no DB hit) so the nav can
 * offer "Open dashboard" to someone already signed in instead of asking them
 * to log in again.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="mk">
      <MarketingNav signedIn={session !== null} />
      {children}
      <MarketingFooter />
    </div>
  );
}
