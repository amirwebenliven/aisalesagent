import type { Metadata } from "next";
import Hero from "@/components/marketing/Hero";
import LiveDemo from "@/components/marketing/LiveDemo";
import HowItWorks from "@/components/marketing/HowItWorks";
import Channels from "@/components/marketing/Channels";
import WhyUs from "@/components/marketing/WhyUs";
import Compare from "@/components/marketing/Compare";
import PricingPreview from "@/components/marketing/PricingPreview";
import Faq from "@/components/marketing/Faq";
import ClosingCta from "@/components/marketing/ClosingCta";

export const metadata: Metadata = {
  title: "Agent Platform — an AI sales agent that knows when to stop",
  description:
    "Answer every lead in seconds on Telegram, WhatsApp and your website, from your own knowledge base — " +
    "with the real cost per reply on screen, any AI provider, and a human handover built in.",
};

export default function HomePage() {
  return (
    <main>
      <Hero />
      <LiveDemo />
      <HowItWorks />
      <Channels />
      <WhyUs />
      <Compare />
      <PricingPreview />
      <Faq />
      <ClosingCta />
    </main>
  );
}
