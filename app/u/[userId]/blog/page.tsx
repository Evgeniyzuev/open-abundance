import PublicUserPage from "@/components/PublicUserPage";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { UserProvider } from "@/components/UserProvider";
import { redirect } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { isSharedContentId } from "@/lib/sharedContentAccess";

export default async function UserBlogRoute({ params, searchParams }: { params: { userId: string }; searchParams?: { post?: string } }) {
  if (isSharedContentId(searchParams?.post)) {
    const { data: post } = await createServiceSupabaseClient().from("feed_posts").select("id,post_type").eq("id", searchParams.post).maybeSingle();
    if (post?.post_type === "external_link") redirect(`/p/${post.id}`);
  }
  return (
    <>
      <ServiceWorkerRegister />
      <UserProvider>
        <PublicUserPage userId={params.userId} initialView="blog" />
      </UserProvider>
    </>
  );
}
