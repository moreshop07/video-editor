import { type ReactNode } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";

interface AppShellProps {
  preview: ReactNode;
  timeline: ReactNode;
  properties: ReactNode;
}

export default function AppShell({
  preview,
  timeline,
  properties,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-primary)]">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Asset Library */}
        <aside className="flex w-72 flex-shrink-0 flex-col border-r border-white/10 bg-[var(--bg-secondary)]">
          <Sidebar />
        </aside>

        {/* Center - Preview + Timeline */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Preview area */}
          <div className="flex flex-1 items-center justify-center border-b border-white/10 bg-[var(--bg-primary)]">
            {preview}
          </div>

          {/* Timeline area */}
          <div className="h-[280px] flex-shrink-0 bg-[var(--timeline-bg)]">
            {timeline}
          </div>
        </main>

        {/* Right Sidebar - Properties */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto border-l border-white/10 bg-[var(--bg-secondary)]">
          {properties}
        </aside>
      </div>
    </div>
  );
}
