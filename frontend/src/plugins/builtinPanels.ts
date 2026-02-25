import { SidebarRegistry } from './registries/SidebarRegistry';
import type { SidebarPanelContribution } from './types';

import AssetLibrary from '@/components/assets/AssetLibrary';
import MusicLibrary from '@/components/audio/MusicLibrary';
import SoundEffectsLibrary from '@/components/audio/SoundEffectsLibrary';
import EffectsPanel from '@/components/editor/panels/EffectsPanel';
import StickerLibrary from '@/components/stickers/StickerLibrary';
import { TextLibrary } from '@/components/text/TextLibrary';
import { ShapeLibrary } from '@/components/shapes/ShapeLibrary';
import SubtitleEditor from '@/components/subtitles/SubtitleEditor';
import VideoDownloadPanel from '@/components/download/VideoDownloadPanel';
import VideoAnalyzerPanel from '@/components/analysis/VideoAnalyzerPanel';
import AutoEditPanel from '@/components/autoedit/AutoEditPanel';
import AIVideoPanel from '@/components/ai/AIVideoPanel';
import ScriptDirectorPanel from '@/components/ai/ScriptDirectorPanel';
import AudioMixerPanel from '@/components/audio/AudioMixerPanel';
import SmartAutoEditPanel from '@/components/smartedit/SmartAutoEditPanel';
import CaptionAccessibilityPanel from '@/components/captions/CaptionAccessibilityPanel';
import TTSPanel from '@/components/tts/TTSPanel';
import TemplateBrowserPanel from '@/components/templates/TemplateBrowserPanel';
import CropZoomPanel from '@/components/editor/panels/CropZoomPanel';
import MarkersPanel from '@/components/editor/panels/MarkersPanel';
import ScreenRecorderPanel from '@/components/recorder/ScreenRecorderPanel';
import MotionTrackingPanel from '@/components/motiontracking/MotionTrackingPanel';
import PluginManagerPanel from '@/components/plugins/PluginManagerPanel';

const builtinPanels: SidebarPanelContribution[] = [
  { key: 'assets', labelKey: 'assets', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', component: AssetLibrary, order: 0 },
  { key: 'music', labelKey: 'music', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3', component: MusicLibrary, order: 1 },
  { key: 'soundEffects', labelKey: 'soundEffects', icon: 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z', component: SoundEffectsLibrary, order: 2 },
  { key: 'effects', labelKey: 'effects', icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z', component: EffectsPanel, order: 3 },
  { key: 'stickers', labelKey: 'stickers', icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', component: StickerLibrary, order: 4 },
  { key: 'text', labelKey: 'text.title', icon: 'M4 6h16M4 12h8m-8 6h16', component: TextLibrary, order: 5 },
  { key: 'shapes', labelKey: 'shape.title', icon: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z', component: ShapeLibrary, order: 6 },
  { key: 'subtitles', labelKey: 'subtitles', icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z', component: SubtitleEditor, order: 7 },
  { key: 'download', labelKey: 'download.title', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4', component: VideoDownloadPanel, order: 8 },
  { key: 'analyzer', labelKey: 'analyzer.title', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', component: VideoAnalyzerPanel, order: 9 },
  { key: 'autoEdit', labelKey: 'autoEdit.title', icon: 'M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z', component: AutoEditPanel, order: 10 },
  { key: 'aiVideo', labelKey: 'aiVideo.title', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', component: AIVideoPanel, order: 11 },
  { key: 'scriptDirector', labelKey: 'scriptDirector.title', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z', component: ScriptDirectorPanel, order: 11.5 },
  { key: 'mixer', labelKey: 'mixer.title', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4', component: AudioMixerPanel, order: 12 },
  { key: 'smartEdit', labelKey: 'smartEdit.title', icon: 'M13 10V3L4 14h7v7l9-11h-7z', component: SmartAutoEditPanel, order: 13 },
  { key: 'captions', labelKey: 'captions.title', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', component: CaptionAccessibilityPanel, order: 14 },
  { key: 'tts', labelKey: 'tts.title', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z', component: TTSPanel, order: 15 },
  { key: 'templates', labelKey: 'template.browser', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', component: TemplateBrowserPanel, order: 16 },
  { key: 'cropZoom', labelKey: 'cropZoom.title', icon: 'M4 4h7V2H2v9h2V4zm13 0v7h2V2h-9v2h7zM4 20v-7H2v9h9v-2H4zm16 0h-7v2h9v-9h-2v7z', component: CropZoomPanel, order: 17 },
  { key: 'markers', labelKey: 'markers.title', icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z', component: MarkersPanel, order: 18 },
  { key: 'record', labelKey: 'record.title', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', component: ScreenRecorderPanel, order: 19 },
  { key: 'motionTracking', labelKey: 'motionTracking.title', icon: 'M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83M9.76 14.24l-2.83 2.83m9.9 0l-2.83-2.83M9.76 9.76L6.93 6.93', component: MotionTrackingPanel, order: 20 },
  { key: 'plugins', labelKey: 'plugins.title', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m0 2v8m-4-6h8m-8 0a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 104 0 2 2 0 00-4 0z', component: PluginManagerPanel, order: 100 },
];

export function registerBuiltinPanels(): void {
  for (const panel of builtinPanels) {
    SidebarRegistry.register(panel);
  }
}
