import PublicUserPage from "@/components/PublicUserPage";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { UserProvider } from "@/components/UserProvider";
import { profileLinkMetadata } from "@/lib/profileMetadata";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: { userId: string } }): Promise<Metadata> {
  return profileLinkMetadata(params.userId, "profile");
}

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
