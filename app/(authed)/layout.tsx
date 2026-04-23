import { auth, clerkClient } from "@clerk/nextjs/server";
import { RevisionRibbon } from "@/components/nav/RevisionRibbon";
import { Sidebar } from "@/components/nav/Sidebar";
import { TopBar } from "@/components/nav/TopBar";
import { NoOrgGate } from "@/components/nav/NoOrgGate";
import { ensureWorkspace } from "@/lib/db/workspace";

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { orgId } = await auth();

  if (!orgId) {
    return (
      <div className="flex h-screen w-full flex-col bg-[var(--color-cream)]">
        <TopBar />
        <NoOrgGate />
      </div>
    );
  }

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({
    organizationId: orgId,
  });
  await ensureWorkspace({ clerkOrgId: orgId, orgName: org.name });

  return (
    <div className="flex h-screen w-full flex-col bg-[var(--color-cream)]">
      <TopBar />
      <RevisionRibbon />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="relative flex flex-1 flex-col overflow-hidden bg-[var(--color-cream)]">
          {children}
        </main>
      </div>
    </div>
  );
}
