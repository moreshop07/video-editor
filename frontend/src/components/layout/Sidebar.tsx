import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import AssetLibrary from "@/components/assets/AssetLibrary";
import SubtitleEditor from "@/components/subtitles/SubtitleEditor";
import EffectsPanel from "@/components/editor/panels/EffectsPanel";
import MusicLibrary from "@/components/audio/MusicLibrary";
import SoundEffectsLibrary from "@/components/audio/SoundEffectsLibrary";
import StickerLibrary from "@/components/stickers/StickerLibrary";

type SidebarTab =
  | "assets"
  | "music"
  | "soundEffects"
  | "effects"
  | "stickers"
  | "subtitles";

interface TabConfig {
  key: SidebarTab;
  labelKey: string;
  icon: string;
}

const tabs: TabConfig[] = [
  { key: "assets", labelKey: "assets", icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { key: "music", labelKey: "music", icon: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" },
  { key: "soundEffects", labelKey: "soundEffects", icon: "M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" },
  { key: "effects", labelKey: "effects", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
  { key: "stickers", labelKey: "stickers", icon: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { key: "subtitles", labelKey: "subtitles", icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" },
];

function SidebarComponent() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SidebarTab>("assets");

  const renderContent = () => {
    switch (activeTab) {
      case "assets":
        return <AssetLibrary />;
      case "music":
        return <MusicLibrary />;
      case "soundEffects":
        return <SoundEffectsLibrary />;
      case "effects":
        return <EffectsPanel />;
      case "stickers":
        return <StickerLibrary />;
      case "subtitles":
        return <SubtitleEditor />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex flex-shrink-0 border-b border-white/10">
        <div className="flex flex-wrap gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-2 text-[10px] transition-colors ${
                activeTab === tab.key
                  ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              title={t(tab.labelKey)}
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
                  d={tab.icon}
                />
              </svg>
              <span className="max-w-[3rem] truncate">{t(tab.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex flex-1 flex-col overflow-hidden">{renderContent()}</div>
    </div>
  );
}

export default React.memo(SidebarComponent);
