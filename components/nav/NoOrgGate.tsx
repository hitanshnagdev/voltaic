import { CreateOrganization } from "@clerk/nextjs";

export function NoOrgGate() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--color-cream)] p-8">
      <div className="w-full max-w-[440px] text-center">
        <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
          Create your workspace
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Voltaic uses organizations as workspaces. Create one for your company
          (e.g. &ldquo;MidWest Electric&rdquo;) to get started.
        </p>
        <div className="mt-6 flex justify-center">
          <CreateOrganization
            afterCreateOrganizationUrl="/feed"
            appearance={{
              variables: { colorPrimary: "#cc785c" },
            }}
          />
        </div>
      </div>
    </div>
  );
}
