import AppNavigation from "@/components/AppNavigation";
import { OnboardingGate } from "@/components/OnboardingApp";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { UserProvider } from "@/components/UserProvider";

export default function Home() {
  return (
    <main className="app-shell">
      <ServiceWorkerRegister />
      <UserProvider>
        <OnboardingGate>
          <AppNavigation />
        </OnboardingGate>
      </UserProvider>
    </main>
  );
}
