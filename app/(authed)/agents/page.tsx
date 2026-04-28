import { auth, clerkClient } from "@clerk/nextjs/server";
import { AgentsClient } from "@/components/agents/AgentsClient";
import { listAgents } from "@/lib/db/agents";
import { ensureWorkspace } from "@/lib/db/workspace";

/**
 * /agents — chat surface. Each workspace gets a seeded "Compliance
 * Reviewer" agent on bootstrap (lib/db/workspace.ts) and the user can
 * create more from the in-app form. URL state: `?agent=<id>` selects
 * an agent; `?session=<id>` opens a specific conversation.
 *
 * The server component does the auth + initial agents fetch only —
 * sessions, messages, and streaming all run client-side from
 * AgentsClient.
 */
export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; session?: string }>;
}) {
  const { orgId } = await auth();
  if (!orgId) return null;

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({
    organizationId: orgId,
  });
  const { workspace, project } = await ensureWorkspace({
    clerkOrgId: orgId,
    orgName: org.name,
  });

  const [params, agents] = await Promise.all([
    searchParams,
    listAgents(workspace.id),
  ]);

  return (
    <AgentsClient
      projectName={project.name}
      initialAgents={agents}
      initialAgentId={params.agent ?? null}
      initialSessionId={params.session ?? null}
    />
  );
}
