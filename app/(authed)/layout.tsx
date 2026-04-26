import { auth, clerkClient } from "@clerk/nextjs/server";
import { RevisionRibbon } from "@/components/nav/RevisionRibbon";
import { Sidebar } from "@/components/nav/Sidebar";
import { TopBar } from "@/components/nav/TopBar";
import { NoOrgGate } from "@/components/nav/NoOrgGate";
import { getProjectChrome } from "@/lib/db/chrome";
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
        <TopBar projectName={null} projectStatus={null} />
        <NoOrgGate />
      </div>
    );
  }

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({
    organizationId: orgId,
  });
  const { workspace, project } = await ensureWorkspace({
    clerkOrgId: orgId,
    orgName: org.name,
  });

  const chrome = await getProjectChrome({
    workspaceId: workspace.id,
    projectId: project.id,
  });

  return (
    <div className="flex h-screen w-full flex-col bg-[var(--color-cream)]">
      <TopBar
        projectName={chrome.projectName}
        projectStatus={chrome.projectStatus}
      />
      <RevisionRibbon
        documentCount={chrome.documentCount}
        equipmentCount={chrome.equipmentCount}
        openFindingCount={chrome.findingCounts.open}
        lastAnalysisAt={chrome.lastAnalysisAt}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          projectName={chrome.projectName}
          openFindingCount={chrome.findingCounts.open}
        />
        <main className="relative flex flex-1 flex-col overflow-hidden bg-[var(--color-cream)]">
          {children}
        </main>
      </div>
    </div>
  );
}
