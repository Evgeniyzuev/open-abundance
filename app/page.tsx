import AppNavigation from "@/components/AppNavigation";
import GrowthAnalytics from "@/components/GrowthAnalytics";
import { OnboardingGate } from "@/components/OnboardingApp";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import PublicIntro from "@/components/PublicIntro";
import PushReminderPrompt from "@/components/PushReminderPrompt";
import TelegramBotPrompt from "@/components/TelegramBotPrompt";
import TimezoneSync from "@/components/TimezoneSync";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import ShareTargetBootstrap from "@/components/ShareTargetBootstrap";
import { UserProvider } from "@/components/UserProvider";
import { SITE_URL } from "@/lib/guideLocales";

const LOGO_URL = `${SITE_URL}/icons/twenty-levels-app-icon-512.png`;

// Structured data for search engines and AI assistants: who we are and what the app is.
const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Open Abundance",
    url: SITE_URL,
    logo: LOGO_URL,
    description: "An open experiment in participation and mutual help: people turn goals into small daily steps, help each other, trade skills and goods, and take on verifiable useful tasks."
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Open Abundance",
    url: SITE_URL,
    inLanguage: ["en", "ru"]
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Open Abundance",
    url: SITE_URL,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Any (web, installable PWA)",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description: "Free app and AI coordinator that help turn a goal into small daily steps and connect people who help each other. Early pilot; internal rewards are not an investment."
  }
];

export default function Home() {
  return (
    <main className="app-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <PublicIntro />
      <ServiceWorkerRegister />
      <UserProvider>
        <ShareTargetBootstrap />
        <GrowthAnalytics />
        <InstallAppPrompt />
        <TimezoneSync />
        <PushReminderPrompt />
        <TelegramBotPrompt />
        <OnboardingGate>
          <AppNavigation />
        </OnboardingGate>
      </UserProvider>
    </main>
  );
}
