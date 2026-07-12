import AppNavigation from "@/components/AppNavigation";
import NotesApp from "@/components/NotesApp";
import { OnboardingGate } from "@/components/OnboardingApp";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { UserProvider } from "@/components/UserProvider";

export default function Home() {
  return (
    <main className="app-shell">
      <ServiceWorkerRegister />
      <UserProvider>
        <OnboardingGate>
          <AppNavigation notesSlot={<NotesApp />} />
        </OnboardingGate>
      </UserProvider>
    </main>
  );
}
