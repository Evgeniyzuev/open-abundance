import AppNavigation from "@/components/AppNavigation";
import GrowthAnalytics from "@/components/GrowthAnalytics";
import { OnboardingGate } from "@/components/OnboardingApp";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { UserProvider } from "@/components/UserProvider";

// Server-rendered public surface. AI crawlers and in-app webviews read only
// the first HTML response, so this block must stay a server component.
function PublicIntro() {
  return (
    <section className="public-intro">
      <h1>Open Abundance</h1>
      <p>
        An open experiment in building a more abundant economy. Turn goals into
        real actions, people and resources.
      </p>
      <ul>
        <li>Declare what you want and turn it into step-by-step missions.</li>
        <li>Complete daily challenges and see real results grow.</li>
        <li>Help others fulfill their wishes and build trust together.</li>
      </ul>
      <p>
        <a href="/about">What is Open Abundance?</a>{" "}
        <a href="/experiment">What we are testing now</a>
      </p>
    </section>
  );
}

export default function Home() {
  return (
    <main className="app-shell">
      <ServiceWorkerRegister />
      <PublicIntro />
      <UserProvider>
        <GrowthAnalytics />
        <OnboardingGate>
          <AppNavigation />
        </OnboardingGate>
      </UserProvider>
    </main>
  );
}