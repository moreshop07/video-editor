"""Default subtitle style presets for auto-editing pipeline.

These presets mirror the Filmora settings used by Moresie productions.
Supports both drawtext (preferred, precise shadow control) and
ASS/subtitles filter (fallback).

Shadow uses drawtext shadowx/shadowy instead of outline/stroke.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Shadow config (from Filmora)
# ---------------------------------------------------------------------------

@dataclass
class ShadowConfig:
    """Drop shadow settings (replaces outline/stroke)."""
    enabled: bool = True
    color: str = "black"
    opacity: float = 0.90        # 90%
    blur: float = 0.15           # 15% (approximated in drawtext)
    distance: int = 5
    angle: int = -45             # degrees

    @property
    def shadowx(self) -> int:
        """X offset for drawtext (positive = right)."""
        # Filmora angle: -45° → shadow goes bottom-right
        rad = math.radians(self.angle)
        return round(self.distance * math.cos(rad))

    @property
    def shadowy(self) -> int:
        """Y offset for drawtext (positive = down)."""
        rad = math.radians(self.angle)
        # Negate sin because screen Y is inverted
        return round(self.distance * -math.sin(rad))

    @property
    def shadowcolor_ffmpeg(self) -> str:
        """Shadow color string for drawtext filter."""
        return f"{self.color}@{self.opacity:.2f}"


# ---------------------------------------------------------------------------
# Role-based color system (max 4 per video)
# ---------------------------------------------------------------------------

@dataclass
class RoleColor:
    """Color assignment per speaker role."""
    name: str
    label_zh: str
    color_hex: str
    # ASS format: &HBBGGRR (reversed byte order, no alpha)
    color_ass: str


ROLE_COLORS: dict[str, RoleColor] = {
    "main": RoleColor(
        name="main",
        label_zh="主角",
        color_hex="#FFFFFF",
        color_ass="&H00FFFFFF",
    ),
    "emphasis": RoleColor(
        name="emphasis",
        label_zh="重點",
        color_hex="#7CB342",
        color_ass="&H0042B37C",
    ),
    "narrator": RoleColor(
        name="narrator",
        label_zh="藏鏡人",
        color_hex="#42A5F5",
        color_ass="&H00F5A542",
    ),
    "os": RoleColor(
        name="os",
        label_zh="OS補充",
        color_hex="#F48FB1",
        color_ass="&H00B18FF4",
    ),
}

MAX_COLORS_PER_VIDEO = 4


# ---------------------------------------------------------------------------
# Font size tiers (Filmora units → pixel at 1080x1920)
# ---------------------------------------------------------------------------

@dataclass
class FontSizeTier:
    """Font size mapping from Filmora to ffmpeg."""
    label: str
    filmora_min: int
    filmora_max: int
    drawtext_size: int   # px for drawtext at 1080x1920
    ass_font_size: int   # for ASS/subtitles filter fallback


FONT_SIZES: dict[str, FontSizeTier] = {
    "subtitle": FontSizeTier(
        label="一般字幕",
        filmora_min=10,
        filmora_max=11,
        drawtext_size=42,
        ass_font_size=42,
    ),
    "emphasis": FontSizeTier(
        label="重點字幕",
        filmora_min=12,
        filmora_max=13,
        drawtext_size=50,
        ass_font_size=50,
    ),
    "title": FontSizeTier(
        label="大標題",
        filmora_min=14,
        filmora_max=16,
        drawtext_size=60,
        ass_font_size=60,
    ),
}


# ---------------------------------------------------------------------------
# Composite preset
# ---------------------------------------------------------------------------

@dataclass
class SubtitlePreset:
    """Complete subtitle style preset for auto-editing."""
    name: str = "moresie_default"
    # Font: VPS has "Noto Sans CJK TC", macOS may have "Noto Sans TC"
    # libass resolves by fontconfig name, so use the CJK variant
    font_family: str = "Noto Sans CJK TC"
    font_weight: str = "Bold"
    shadow: ShadowConfig = field(default_factory=ShadowConfig)
    use_outline: bool = False

    @staticmethod
    def find_font_file() -> str:
        """Locate Noto Sans CJK TC Bold font file on the system."""
        candidates = [
            # Linux (VPS / Docker)
            "/usr/share/fonts/google-noto-cjk/NotoSansCJK-Bold.ttc",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
            "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
            # macOS
            "/Library/Fonts/NotoSansTC-Bold.ttf",
            "/System/Library/Fonts/PingFang.ttc",
        ]
        for path in candidates:
            if os.path.exists(path):
                return path
        return ""
    position: str = "bottom"
    # Distance from bottom edge in px (9:16 at 1080x1920)
    margin_bottom_zh: int = 120   # Chinese line (higher up)
    margin_bottom_en: int = 60    # English line (below Chinese)
    max_chars_per_line: int = 14

    def get_drawtext_args(
        self,
        text: str,
        role: str = "main",
        tier: str = "subtitle",
        is_english: bool = False,
    ) -> str:
        """Generate a single drawtext filter string.

        Args:
            text: The subtitle text to render.
            role: Speaker role key (main/emphasis/narrator/os).
            tier: Font size tier key (subtitle/emphasis/title).
            is_english: If True, use smaller font and lower position.

        Returns:
            drawtext filter parameter string (without 'drawtext=' prefix).
        """
        color = ROLE_COLORS.get(role, ROLE_COLORS["main"])
        size = FONT_SIZES.get(tier, FONT_SIZES["subtitle"])

        font_size = size.drawtext_size
        if is_english:
            font_size = max(24, int(font_size * 0.65))

        margin_bottom = self.margin_bottom_en if is_english else self.margin_bottom_zh

        # Escape text for drawtext: single quotes and colons
        escaped = text.replace("'", "'\\''").replace(":", "\\:")

        parts = [
            f"text='{escaped}'",
            "fontfile=/usr/share/fonts/truetype/noto/NotoSansTC-Bold.ttf",
            f"fontsize={font_size}",
            f"fontcolor={color.color_hex}",
            f"shadowx={self.shadow.shadowx}",
            f"shadowy={self.shadow.shadowy}",
            f"shadowcolor={self.shadow.shadowcolor_ffmpeg}",
            "x=(w-text_w)/2",
            f"y=h-{margin_bottom}-text_h",
            "borderw=0",
        ]
        return ":".join(parts)

    def get_ass_style(self, role: str = "main", tier: str = "subtitle") -> str:
        """Generate ASS force_style string (fallback when drawtext unavailable).

        Args:
            role: Speaker role key.
            tier: Font size tier key.

        Returns:
            ASS force_style string for ffmpeg subtitles filter.
        """
        color = ROLE_COLORS.get(role, ROLE_COLORS["main"])
        size = FONT_SIZES.get(tier, FONT_SIZES["subtitle"])

        shadow_depth = self.shadow.distance if self.shadow.enabled else 0
        alpha_hex = format(int((1 - self.shadow.opacity) * 255), "02X")
        back_colour = f"&H{alpha_hex}000000"

        parts = [
            f"FontName={self.font_family}",
            f"FontSize={size.ass_font_size}",
            f"PrimaryColour={color.color_ass}",
            f"BackColour={back_colour}",
            f"Bold={'1' if self.font_weight == 'Bold' else '0'}",
            "Outline=0",
            f"Shadow={shadow_depth}",
            f"MarginV={self.margin_bottom_en}",
            "Alignment=2",
        ]
        return ",".join(parts)


# Singleton
DEFAULT_PRESET = SubtitlePreset()
