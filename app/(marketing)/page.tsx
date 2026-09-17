import type { Metadata } from "next";
import Hero from "@/components/marketing/Hero";
import LiveDemo from "@/components/marketing/LiveDemo";
import HowItWorks from "@/components/marketing/HowItWorks";
import Channels from "@/components/marketing/Channels";
import WhyUs from "@/components/marketing/WhyUs";
import PricingPreview from "@/components/marketing/PricingPreview";
import Faq from "@/components/marketing/Faq";
import ClosingCta from "@/components/marketing/ClosingCta";

export const metadata: Metadata = {
  title: "Agent Platform — the AI sales agent that answers every lead and knows when to hand over",
  description:
    "Reply to every customer in seconds on WhatsApp, Telegram and your website, from what your business actually knows. " +
    "Captures the lead, books the meeting, hands the hard ones to your team. Free for a month, no card.",
};

/**
 * The public homepage promotes this product and nothing else: no competitor
 * names, no comparison table (CLAUDE.md §16). The section numbers run in
 * order; renumber the Section `n` props if one is added or removed.
 */
export default function HomePage() {
  return (
    <main>
      <Hero />
      <LiveDemo />
      <HowItWorks />
      <Channels />
      <WhyUs />
      <PricingPreview />
      <Faq />
      <ClosingCta />
    </main>
  );
}
