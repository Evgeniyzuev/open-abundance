import AppNavigation from "@/components/AppNavigation";
import GrowthAnalytics from "@/components/GrowthAnalytics";
import { OnboardingGate } from "@/components/OnboardingApp";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { UserProvider } from "@/components/UserProvider";

export default function Home() {
  return (
    <main className="app-shell">
      <ServiceWorkerRegister />
      <UserProvider>
        <GrowthAnalytics />
        <OnboardingGate>
          <AppNavigation />
        </OnboardingGate>
      </UserProvider>
    </main>
  );
}
