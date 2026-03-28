"""
AI 腳本導演服務 (Script Director Service)
==========================================
Moresie Video Studio 的前置模組
草稿 → 爆款短影音腳本（含分鏡、鉤子、CTA）

整合位置：backend/app/services/script_director.py
"""

import json
import logging
from enum import Enum
from typing import Optional

from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field

from app.core.config import settings

logger = logging.getLogger(__name__)

# ============================================================
# Data Models
# ============================================================

class ContentType(str, Enum):
    SKINCARE = "護膚保養"
    HEALTH = "健康保健"
    PRODUCT = "產品推薦"
    MIXED = "混合"

class ScriptDuration(str, Enum):
    SHORT = "30-60s"
    LONG = "60-90s"

class HookLevel(str, Enum):
    S = "S"
    A = "A"
    B = "B"

class TriggerType(str, Enum):
    FEAR = "恐懼"
    COGNITIVE_COLLAPSE = "認知崩塌"
    IDENTITY = "身份射線"
    INFO_GAP = "資訊缺口"
    AUTHORITY = "權威對立"


class ScriptGenerateRequest(BaseModel):
    """腳本生成請求"""
    draft: str = Field(..., min_length=10, max_length=5000, description="原始草稿內容")
    duration: Optional[ScriptDuration] = Field(None, description="指定時長，不填則自動判斷")
    generate_both: bool = Field(True, description="是否同時產生兩種版本")
    hook_count: int = Field(3, ge=1, le=5, description="鉤子版本數量")
    target_audience: Optional[str] = Field(None, description="指定目標受眾")
    voice_dna: Optional[str] = Field(None, description="Voice DNA 語氣說明書，用於自訂 AI 輸出風格")


class Hook(BaseModel):
    """鉤子"""
    version: str
    level: HookLevel
    trigger_types: list[TriggerType]
    text: str
    why_effective: str


class SceneDirection(BaseModel):
    """單一分鏡"""
    section: str
    time_range: str
    script: str
    visual: str
    text_card: Optional[str] = None
    sound_effect: Optional[str] = None
    shooting_note: Optional[str] = None


class ScriptVersion(BaseModel):
    """一個版本的完整腳本"""
    duration: ScriptDuration
    hook_used: str
    word_count: int
    scenes: list[SceneDirection]


class ShareDesign(BaseModel):
    """轉分享設計"""
    main_cta: str
    share_trigger_point: str
    cover_text: str
    series_next: str


class ScriptAnalysis(BaseModel):
    """草稿分析結果"""
    core_point: str
    content_type: ContentType
    suggested_duration: ScriptDuration
    target_audience: str


class ScriptDirectorResponse(BaseModel):
    """完整回應"""
    analysis: ScriptAnalysis
    hooks: list[Hook]
    scripts: list[ScriptVersion]
    share_design: ShareDesign
    checklist: list[str]


# ============================================================
# System Prompt
# ============================================================

SYSTEM_PROMPT = """你是「張藥師帶你不吃藥 × @chinwawa07」的專屬 AI 腳本導演。

你的任務是把藥師寫的知識草稿，轉換成能在短影音平台爆紅的腳本。

## 核心原則

1. **前 1 秒定生死** — 鉤子必須在 0.5-1.5 秒內觸發本能反應
2. **你不是在教課，你是在告訴朋友一個秘密** — 語氣像跟朋友聊天，每句話不超過 15 字
3. **一支影片只說一件事** — 30-60s ≤ 120字，60-90s ≤ 200字

## 五大本能觸發器（由強到弱）

1. **恐懼** ★★★★★ —「我可能正在傷害自己」
2. **認知崩塌** ★★★★ —「我以為的世界是錯的」
3. **身份射線** ★★★★ —「說的就是我」
4. **資訊缺口** ★★★ —「答案是什麼」
5. **權威對立** ★★★ —「專家 vs 常識」

## 鉤子規則

- 優先選 S 級（同時觸發 2+ 本能）
- 鉤子公式：
  A. 顯然的錯誤 + 正確做法：「你還在用___？難怪___」
  B. 數字 + 反常識：「90%的人都不知道，___其實會___」
  C. 挑戰常規 + 替代方案：「醫生不會告訴你，其實你不需要___」
  D. 限定身份 + 痛點：「如果你是___的人，這支影片一定要看完」
  E. 結果先行 + 懸念：「我停了___之後，竟然___」

## 腳本結構

### 30-60 秒
開場鉤子(1-3s) → 痛點強化(5-8s) → 知識核彈(15-30s) → CTA(5-8s)

### 60-90 秒
開場鉤子(1-3s) → 痛點強化(3-15s) → 知識顛覆(15-35s) → 解決方案(35-65s) → CTA(65-80s)

## CTA 公式
具體對象 + 具體原因 + 具體動作
❌ 弱：「請分享給更多人」
✅ 最強：「這支影片可以救你婆婆的臉，請轉給她」

## 轉分享設計
設計內容時問三個問題：
1. 不告訴家人會怎樣？→ 設計「轉給家人」CTA
2. 觀眾想跟誰討論？→ 設計「tag 朋友」CTA
3. 觀眾會想以後再看？→ 設計「收藏」CTA

影片內埋分享觸發點：金句時刻、實驗高潮、字卡截圖、情緒峰值

## 拍攝備註規則
- 語速：鉤子快30%、知識段正常、CTA放慢
- 表情：鉤子誇張/嚴肅、知識段認真、CTA誠懇
- 鏡頭：鉤子用跳切/特寫、知識段圖卡/實驗、CTA回正臉
- 字卡：每個重點都配字卡（觀眾可能靜音）
- 音效：鉤子配「叮」、轉折配「嘶—」、重點配強調音

## 封面文字公式
數字 + 反常識 + 緊迫感
❌「玻尿酸的正確用法」
✅「100元 vs 3000元玻尿酸，差別在哪？」

## 品牌調性
- 張藥師口吻：專業但親切、直白但不粗魯
- 核心理念：帶你不吃藥 — 自然、預防、省錢、不被騙
- 不說教，說秘密；不推銷，說真話
- 專業術語一律用比喻翻譯"""


USER_PROMPT_TEMPLATE = """請將以下草稿轉換成爆款短影音腳本。

## 草稿內容
{draft}

## 要求
- 鉤子版本數量：{hook_count}
- 時長版本：{duration_instruction}
- 目標受眾：{target_audience}

## 輸出格式
請嚴格按照以下 JSON 格式回覆，不要加任何 markdown 標記或額外文字：

{{
  "analysis": {{
    "core_point": "一句話總結核心知識點",
    "content_type": "護膚保養 | 健康保健 | 產品推薦 | 混合",
    "suggested_duration": "30-60s | 60-90s",
    "target_audience": "具體目標受眾描述"
  }},
  "hooks": [
    {{
      "version": "A",
      "level": "S | A | B",
      "trigger_types": ["恐懼", "認知崩塌", "身份射線", "資訊缺口", "權威對立"],
      "text": "鉤子文字",
      "why_effective": "為什麼有效的心理學解析"
    }}
  ],
  "scripts": [
    {{
      "duration": "30-60s | 60-90s",
      "hook_used": "使用的鉤子版本 A/B/C",
      "word_count": 120,
      "scenes": [
        {{
          "section": "開場鉤子 | 痛點強化 | 知識核彈 | 知識顛覆 | 解決方案 | 結尾CTA",
          "time_range": "0-3秒",
          "script": "口播稿",
          "visual": "畫面指示",
          "text_card": "字卡內容（可選）",
          "sound_effect": "音效建議（可選）",
          "shooting_note": "拍攝提醒（可選）"
        }}
      ]
    }}
  ],
  "share_design": {{
    "main_cta": "主要CTA話術",
    "share_trigger_point": "第X秒的「某句話」是分享觸發點",
    "cover_text": "封面文字建議",
    "series_next": "下一集可以講的方向"
  }},
  "checklist": [
    "鉤子為S級，觸發恐懼+權威雙本能",
    "口播稿共118字，符合120字限制",
    "..."
  ]
}}"""


# ============================================================
# Service
# ============================================================

class ScriptDirectorService:
    """AI 腳本導演服務"""

    def __init__(self):
        self.client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = "claude-sonnet-4-5-20250929"

    async def generate_script(
        self, request: ScriptGenerateRequest
    ) -> ScriptDirectorResponse:
        """
        主要入口：草稿 → 爆款腳本

        Args:
            request: 腳本生成請求

        Returns:
            ScriptDirectorResponse: 完整腳本回應
        """
        # 組裝 duration 指示
        if request.generate_both:
            duration_instruction = "請同時產生 30-60s 和 60-90s 兩個版本"
        elif request.duration:
            duration_instruction = f"只產生 {request.duration.value} 版本"
        else:
            duration_instruction = "請自動判斷最適合的長度，並同時產生兩個版本"

        target_audience = request.target_audience or "自動判斷最適合的受眾"

        user_prompt = USER_PROMPT_TEMPLATE.format(
            draft=request.draft,
            hook_count=request.hook_count,
            duration_instruction=duration_instruction,
            target_audience=target_audience,
        )

        logger.info(f"Generating script for draft ({len(request.draft)} chars)")

        # 如果有 Voice DNA，附加到 system prompt
        system_prompt = SYSTEM_PROMPT
        if request.voice_dna:
            system_prompt += f"""

---
## 用戶個人語氣風格 (Voice DNA)
以下是用戶提供的語氣說明書，請在生成腳本時融入這些特徵，讓口播稿聽起來像用戶本人在說話：

{request.voice_dna}
---
注意：Voice DNA 定義的語氣風格優先於上方「品牌調性」段落。口播稿的用字遣詞、節奏、口頭禪都要反映 Voice DNA。"""

        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                temperature=0.7,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )

            raw_text = response.content[0].text.strip()

            # 清理可能的 markdown 包裹
            if raw_text.startswith("```"):
                raw_text = raw_text.split("\n", 1)[1]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                raw_text = raw_text.strip()

            data = json.loads(raw_text)
            result = ScriptDirectorResponse(**data)

            logger.info(
                f"Script generated: {len(result.hooks)} hooks, "
                f"{len(result.scripts)} versions"
            )
            return result

        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {e}\nRaw: {raw_text[:500]}")
            raise ValueError(f"AI 回應格式錯誤，請重試: {e}")
        except Exception as e:
            logger.error(f"Script generation failed: {e}")
            raise

    async def regenerate_hooks(
        self, draft: str, count: int = 5, level: HookLevel = HookLevel.S
    ) -> list[Hook]:
        """
        只重新生成鉤子（不重新生成整個腳本）

        用於：用戶覺得鉤子不夠強，想要更多選項
        """
        prompt = f"""針對以下草稿，請生成 {count} 個 {level.value} 級的爆款鉤子。

草稿：{draft}

請嚴格按照 JSON 陣列格式回覆：
[
  {{
    "version": "A",
    "level": "{level.value}",
    "trigger_types": ["觸發類型"],
    "text": "鉤子文字",
    "why_effective": "解析"
  }}
]"""

        response = await self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            temperature=0.9,  # 更高溫度 = 更多創意
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        raw_text = response.content[0].text.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()

        data = json.loads(raw_text)
        return [Hook(**h) for h in data]

    async def optimize_cta(
        self, script_text: str, target_action: str = "轉發"
    ) -> dict:
        """
        優化 CTA 話術

        target_action: 轉發 / 收藏 / 留言 / 追蹤
        """
        prompt = f"""針對以下腳本，請設計 3 個針對「{target_action}」的 CTA 話術。

腳本：{script_text}

CTA 公式：具體對象 + 具體原因 + 具體動作
強度由弱到強排列。

請用 JSON 格式回覆：
{{
  "target_action": "{target_action}",
  "options": [
    {{"strength": "中", "text": "CTA文字", "why": "為什麼有效"}},
    {{"strength": "強", "text": "CTA文字", "why": "為什麼有效"}},
    {{"strength": "最強", "text": "CTA文字", "why": "為什麼有效"}}
  ]
}}"""

        response = await self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            temperature=0.7,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        raw_text = response.content[0].text.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()

        return json.loads(raw_text)


# 單例
script_director_service = ScriptDirectorService()
