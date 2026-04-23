import { RevisionRibbon } from "@/components/nav/RevisionRibbon";
import { Sidebar } from "@/components/nav/Sidebar";
import { TopBar } from "@/components/nav/TopBar";

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
