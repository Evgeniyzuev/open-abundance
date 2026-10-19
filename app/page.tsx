import AppNavigation from "@/components/AppNavigation";
import GrowthAnalytics from "@/components/GrowthAnalytics";
import { OnboardingGate } from "@/components/OnboardingApp";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import PublicIntro from "@/components/PublicIntro";
import PushReminderPrompt from "@/components/PushReminderPrompt";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import ShareTargetBootstrap from "@/components/ShareTargetBootstrap";
import { UserProvider } from "@/components/UserProvider";

export default function Home() {
  return (
    <main className="app-shell">
      <PublicIntro />
      <ServiceWorkerRegister />
      <UserProvider>
        <ShareTargetBootstrap />
        <GrowthAnalytics />
        <InstallAppPrompt />
        <PushReminderPrompt />
        <OnboardingGate>
          <AppNavigation />
        </OnboardingGate>
      </UserProvider>
    </main>
  );
}
