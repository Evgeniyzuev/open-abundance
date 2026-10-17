import PublicFeedPage from "@/components/PublicFeedPage";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { UserProvider } from "@/components/UserProvider";

export default function PublicFeedRoute() {
  return (
    <>
      <ServiceWorkerRegister />
      <UserProvider>
        <PublicFeedPage />
      </UserProvider>
    </>
  );
}
