export const DEFAULT_GRADIENT_COLOR = "#f1f5f9";

/** Matches the bottom fade overlay in VoiceExperience. */
export const BOTTOM_GRADIENT_HEIGHT_CLASS = "h-[min(52vh,36rem)]";

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim();
  const longMatch = /^#([0-9a-fA-F]{6})$/.exec(normalized);
  if (longMatch) {
    const value = longMatch[1];
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(normalized);
  if (shortMatch) {
    const value = shortMatch[1];
    return {
      r: parseInt(value[0] + value[0], 16),
      g: parseInt(value[1] + value[1], 16),
      b: parseInt(value[2] + value[2], 16),
    };
  }

  return null;
}

export function buildBottomGradient(color?: string): string {
  const rgb =
    parseHexColor(color ?? "") ??
    parseHexColor(DEFAULT_GRADIENT_COLOR) ?? { r: 241, g: 245, b: 249 };
  const { r, g, b } = rgb;

  return [
    `linear-gradient(to top,`,
    `rgb(${r} ${g} ${b}) 0%,`,
    `rgba(${r}, ${g}, ${b}, 0.98) 10%,`,
    `rgba(${r}, ${g}, ${b}, 0.88) 22%,`,
    `rgba(${r}, ${g}, ${b}, 0.68) 38%,`,
    `rgba(${r}, ${g}, ${b}, 0.42) 54%,`,
    `rgba(${r}, ${g}, ${b}, 0.18) 70%,`,
    `rgba(${r}, ${g}, ${b}, 0.04) 84%,`,
    `rgba(${r}, ${g}, ${b}, 0) 100%)`,
  ].join(" ");
}
