/**
 * AI 腳本導演面板 (Script Director Panel)
 * ==========================================
 * 用戶貼入草稿 → AI 生成爆款腳本 → 直接進入剪輯
 */

import { useState, useCallback } from 'react';
import { scriptDirectorApi } from '@/api/client';

// ============================================================
// Types
// ============================================================

interface Hook {
  version: string;
  level: 'S' | 'A' | 'B';
  trigger_types: string[];
  text: string;
  why_effective: string;
}

interface SceneDirection {
  section: string;
  time_range: string;
  script: string;
  visual: string;
  text_card?: string;
  sound_effect?: string;
  shooting_note?: string;
}

interface ScriptVersion {
  duration: '30-60s' | '60-90s';
  hook_used: string;
  word_count: number;
  scenes: SceneDirection[];
}

interface ShareDesign {
  main_cta: string;
  share_trigger_point: string;
  cover_text: string;
  series_next: string;
}

interface ScriptAnalysis {
  core_point: string;
  content_type: string;
  suggested_duration: string;
  target_audience: string;
}

interface ScriptResult {
  analysis: ScriptAnalysis;
  hooks: Hook[];
  scripts: ScriptVersion[];
  share_design: ShareDesign;
  checklist: string[];
}

// ============================================================
// API helpers (using shared apiClient with JWT auth)
// ============================================================

async function generateScript(draft: string, options: Record<string, unknown> = {}): Promise<ScriptResult> {
  const { data } = await scriptDirectorApi.generate({
    draft,
    generate_both: true,
    hook_count: 3,
    ...options,
  });
  return data;
}

async function regenerateHooksApi(draft: string, count = 5, level: 'S' | 'A' | 'B' = 'S'): Promise<Hook[]> {
  const { data } = await scriptDirectorApi.regenerateHooks({ draft, count, level });
  return data;
}

// ============================================================
// Sub-components
// ============================================================

const LEVEL_STYLES: Record<string, string> = {
  S: 'bg-red-600 text-white',
  A: 'bg-orange-500 text-white',
  B: 'bg-amber-400 text-gray-900',
};

const SECTION_COLORS: Record<string, string> = {
  '開場鉤子': 'border-l-red-500 bg-red-500/5',
  '痛點強化': 'border-l-orange-500 bg-orange-500/5',
  '知識核彈': 'border-l-emerald-500 bg-emerald-500/5',
  '知識顛覆': 'border-l-emerald-500 bg-emerald-500/5',
  '解決方案': 'border-l-blue-500 bg-blue-500/5',
  '結尾CTA': 'border-l-purple-500 bg-purple-500/5',
};

function HookCard({ hook, selected, onSelect }: { hook: Hook; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
        selected
          ? 'border-emerald-500 bg-emerald-500/5 shadow-lg shadow-emerald-500/10'
          : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${LEVEL_STYLES[hook.level]}`}>
          {hook.level}級
        </span>
        <span className="text-xs text-gray-400">版本 {hook.version}</span>
        <div className="flex gap-1 ml-auto">
          {hook.trigger_types.map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded bg-gray-700 text-[10px] text-gray-300">{t}</span>
          ))}
        </div>
      </div>
      <p className="text-white font-medium text-sm leading-relaxed">{hook.text}</p>
      <p className="text-gray-500 text-xs mt-2 leading-relaxed">{hook.why_effective}</p>
    </button>
  );
}

function SceneCard({ scene }: { scene: SceneDirection }) {
  const colorClass = SECTION_COLORS[scene.section] || 'border-l-gray-500 bg-gray-500/5';

  return (
    <div className={`border-l-4 rounded-r-lg p-4 ${colorClass}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-white text-sm">{scene.section}</span>
        <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">{scene.time_range}</span>
      </div>

      <div className="space-y-2">
        <div>
          <span className="text-xs text-gray-500">口播</span>
          <p className="text-white text-sm mt-0.5 leading-relaxed">{scene.script}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">畫面</span>
          <p className="text-gray-300 text-sm mt-0.5">{scene.visual}</p>
        </div>
        {scene.text_card && (
          <div>
            <span className="text-xs text-gray-500">字卡</span>
            <p className="text-amber-300 text-sm mt-0.5">{scene.text_card}</p>
          </div>
        )}
        {scene.sound_effect && (
          <div>
            <span className="text-xs text-gray-500">音效</span>
            <p className="text-gray-400 text-sm mt-0.5">{scene.sound_effect}</p>
          </div>
        )}
        {scene.shooting_note && (
          <div className="bg-red-500/10 rounded p-2 mt-1">
            <span className="text-xs text-red-400">{scene.shooting_note}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function ScriptDirectorPanel() {
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [selectedHook, setSelectedHook] = useState(0);
  const [activeTab, setActiveTab] = useState<'30-60s' | '60-90s'>('30-60s');
  const [error, setError] = useState('');
  const [voiceDna, setVoiceDna] = useState(() => localStorage.getItem('voiceDNA_prompt') || '');
  const [showVoiceDna, setShowVoiceDna] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!draft.trim() || draft.length < 10) {
      setError('草稿至少需要 10 個字');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await generateScript(draft, voiceDna ? { voice_dna: voiceDna } : {});
      setResult(data);
      setSelectedHook(0);
      if (data.analysis.suggested_duration === '60-90s') {
        setActiveTab('60-90s');
      } else {
        setActiveTab('30-60s');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '生成失敗，請重試');
    } finally {
      setLoading(false);
    }
  }, [draft]);

  const handleRegenerateHooks = useCallback(async () => {
    if (!draft.trim()) return;
    setLoading(true);
    try {
      const hooks = await regenerateHooksApi(draft, 5, 'S');
      if (result) {
        setResult({ ...result, hooks });
        setSelectedHook(0);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '鉤子生成失敗');
    } finally {
      setLoading(false);
    }
  }, [draft, result]);

  const activeScripts = result?.scripts.filter((s) => s.duration === activeTab) || [];

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <div>
          <h2 className="text-sm font-bold text-white">AI 腳本導演</h2>
          <p className="text-[10px] text-gray-500">草稿 → 爆款短影音腳本</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Input */}
        <div className="flex flex-col p-3 gap-2 border-b border-gray-800">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={"把你的知識草稿貼在這裡...\n\n例如：\n玻尿酸是一種很好的保濕成分，它可以吸收自身1000倍重量的水分。但是不同分子量的玻尿酸有不同的作用..."}
            className="h-32 bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
          />
          {/* Voice DNA 匯入區 */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setShowVoiceDna(!showVoiceDna)}
              className="flex items-center gap-1.5 text-[10px] text-amber-400 hover:text-amber-300 transition-colors w-fit"
            >
              <span>{showVoiceDna ? '▾' : '▸'}</span>
              <span>Voice DNA 語氣說明書</span>
              {voiceDna && !showVoiceDna && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px]">已匯入</span>
              )}
            </button>
            {showVoiceDna && (
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={voiceDna}
                  onChange={(e) => {
                    setVoiceDna(e.target.value);
                    localStorage.setItem('voiceDNA_prompt', e.target.value);
                  }}
                  placeholder={"貼上你的 Voice DNA 語氣說明書⋯⋯\n\n從 moresie.com/voice-dna 生成後複製貼上"}
                  className="h-24 bg-gray-800 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-100 placeholder-gray-600 resize-none focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-colors"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-gray-600">AI 生成腳本時會套用你的語氣風格</span>
                  {voiceDna && (
                    <button
                      type="button"
                      onClick={() => { setVoiceDna(''); localStorage.removeItem('voiceDNA_prompt'); }}
                      className="text-[9px] text-red-400 hover:text-red-300"
                    >
                      清除
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">{draft.length} / 5000 字</span>
            <button
              onClick={handleGenerate}
              disabled={loading || draft.length < 10}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  AI 導演分析中...
                </>
              ) : (
                <>生成爆款腳本</>
              )}
            </button>
          </div>
          {error && <p className="text-red-400 text-[10px]">{error}</p>}
        </div>

        {/* Results */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!result ? (
            <div className="flex-1 flex items-center justify-center text-gray-600">
              <div className="text-center px-4">
                <p className="text-sm">貼入草稿，AI 導演幫你打造爆款腳本</p>
                <p className="text-xs mt-1 text-gray-700">包含 S 級鉤子、分鏡腳本、轉分享設計</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Analysis */}
              <div className="p-3 border-b border-gray-800">
                <h3 className="text-xs font-bold text-gray-300 mb-2">草稿分析</h3>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="bg-gray-800 rounded-lg p-2">
                    <span className="text-gray-500">核心知識點</span>
                    <p className="text-white mt-0.5">{result.analysis.core_point}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <span className="text-gray-500">內容類型</span>
                    <p className="text-white mt-0.5">{result.analysis.content_type}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <span className="text-gray-500">建議長度</span>
                    <p className="text-emerald-400 font-medium mt-0.5">{result.analysis.suggested_duration}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <span className="text-gray-500">目標受眾</span>
                    <p className="text-white mt-0.5">{result.analysis.target_audience}</p>
                  </div>
                </div>
              </div>

              {/* Hooks */}
              <div className="p-3 border-b border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-gray-300">鉤子選擇</h3>
                  <button
                    onClick={handleRegenerateHooks}
                    disabled={loading}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    重新生成更多鉤子
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {result.hooks.map((hook, i) => (
                    <div key={i} className="min-w-[240px] max-w-[280px]">
                      <HookCard
                        hook={hook}
                        selected={selectedHook === i}
                        onSelect={() => setSelectedHook(i)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Script Tabs */}
              <div className="flex items-center gap-1 px-3 pt-2">
                {(['30-60s', '60-90s'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors ${
                      activeTab === tab
                        ? 'bg-gray-800 text-white border-t border-x border-gray-700'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {tab}
                    {result.analysis.suggested_duration === tab && (
                      <span className="ml-1 text-[9px] bg-emerald-600 text-white px-1 py-0.5 rounded">推薦</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Script Content */}
              <div className="flex-1 overflow-y-auto bg-gray-800/30 p-3 space-y-2">
                {activeScripts.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-gray-500">
                        使用鉤子版本 {activeScripts[0]?.hook_used} ・
                        口播稿 {activeScripts[0]?.word_count} 字
                      </span>
                    </div>
                    {activeScripts[0]?.scenes.map((scene, i) => (
                      <SceneCard key={i} scene={scene} />
                    ))}

                    {/* Share Design */}
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 mt-3 space-y-2">
                      <h3 className="text-xs font-bold text-purple-300">轉分享設計</h3>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="text-purple-400">主要 CTA</span>
                          <p className="text-white mt-0.5">{result.share_design.main_cta}</p>
                        </div>
                        <div>
                          <span className="text-purple-400">分享觸發點</span>
                          <p className="text-white mt-0.5">{result.share_design.share_trigger_point}</p>
                        </div>
                        <div>
                          <span className="text-purple-400">封面文字</span>
                          <p className="text-amber-300 font-medium mt-0.5">{result.share_design.cover_text}</p>
                        </div>
                        <div>
                          <span className="text-purple-400">系列化方向</span>
                          <p className="text-white mt-0.5">{result.share_design.series_next}</p>
                        </div>
                      </div>
                    </div>

                    {/* Checklist */}
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mt-2">
                      <h3 className="text-xs font-bold text-emerald-300 mb-1.5">自我檢查</h3>
                      <div className="space-y-0.5">
                        {result.checklist.map((item, i) => (
                          <p key={i} className="text-[10px] text-gray-300">{item}</p>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-600">
                    <p className="text-xs">此時長無可用腳本</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
