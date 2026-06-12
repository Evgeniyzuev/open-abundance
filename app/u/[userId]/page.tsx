import PublicUserPage from "@/components/PublicUserPage";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { UserProvider } from "@/components/UserProvider";

export default function UserProfileRoute({ params }: { params: { userId: string } }) {
  return (
    <>
      <ServiceWorkerRegister />
      <UserProvider>
        <PublicUserPage userId={params.userId} initialView="profile" />
      </UserProvider>
    </>
  );
}
