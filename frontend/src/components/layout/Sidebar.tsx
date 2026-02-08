import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import AssetLibrary from "@/components/assets/AssetLibrary";
import SubtitleEditor from "@/components/subtitles/SubtitleEditor";
import EffectsPanel from "@/components/editor/panels/EffectsPanel";
import MusicLibrary from "@/components/audio/MusicLibrary";
import SoundEffectsLibrary from "@/components/audio/SoundEffectsLibrary";
import StickerLibrary from "@/components/stickers/StickerLibrary";
import { TextLibrary } from "@/components/text/TextLibrary";
import VideoDownloadPanel from "@/components/download/VideoDownloadPanel";
import VideoAnalyzerPanel from "@/components/analysis/VideoAnalyzerPanel";
import AutoEditPanel from "@/components/autoedit/AutoEditPanel";
import AIVideoPanel from "@/components/ai/AIVideoPanel";
import AudioMixerPanel from "@/components/audio/AudioMixerPanel";
import SmartAutoEditPanel from "@/components/smartedit/SmartAutoEditPanel";
import CaptionAccessibilityPanel from "@/components/captions/CaptionAccessibilityPanel";

type SidebarTab =
  | "assets"
  | "music"
  | "soundEffects"
  | "effects"
  | "stickers"
  | "subtitles"
  | "text"
  | "download"
  | "analyzer"
  | "autoEdit"
  | "aiVideo"
  | "mixer"
  | "smartEdit"
  | "captions";

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
  { key: "text", labelKey: "text.title", icon: "M4 6h16M4 12h8m-8 6h16" },
  { key: "subtitles", labelKey: "subtitles", icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" },
  { key: "download", labelKey: "download.title", icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" },
  { key: "analyzer", labelKey: "analyzer.title", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { key: "autoEdit", labelKey: "autoEdit.title", icon: "M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" },
  { key: "aiVideo", labelKey: "aiVideo.title", icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
  { key: "mixer", labelKey: "mixer.title", icon: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" },
  { key: "smartEdit", labelKey: "smartEdit.title", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { key: "captions", labelKey: "captions.title", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
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
      case "text":
        return <TextLibrary />;
      case "subtitles":
        return <SubtitleEditor />;
      case "download":
        return <VideoDownloadPanel />;
      case "analyzer":
        return <VideoAnalyzerPanel />;
      case "autoEdit":
        return <AutoEditPanel />;
      case "aiVideo":
        return <AIVideoPanel />;
      case "mixer":
        return <AudioMixerPanel />;
      case "smartEdit":
        return <SmartAutoEditPanel />;
      case "captions":
        return <CaptionAccessibilityPanel />;
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
