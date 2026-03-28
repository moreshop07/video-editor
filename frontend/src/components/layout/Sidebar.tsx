import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSidebarRegistry } from "@/plugins/hooks";

function SidebarComponent() {
  const { t } = useTranslation();
  const panels = useSidebarRegistry();
  const [activeKey, setActiveKey] = useState<string>("assets");

  const activePanel = panels.find((p) => p.key === activeKey);
  const ActiveComponent = activePanel?.component ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex flex-shrink-0 border-b border-white/10">
        <div className="flex flex-wrap gap-0">
          {panels.map((panel) => (
            <button
              key={panel.key}
              onClick={() => setActiveKey(panel.key)}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-2 text-[10px] transition-colors ${
                activeKey === panel.key
                  ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              title={t(panel.labelKey)}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d={panel.icon}
                />
              </svg>
              <span className="max-w-[3rem] truncate">{t(panel.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {ActiveComponent ? <ActiveComponent /> : null}
      </div>
    </div>
  );
}

export default React.memo(SidebarComponent);
