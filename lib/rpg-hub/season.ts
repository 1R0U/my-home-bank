import type { Season } from "../../types/map";

// 既存コードに季節判定はないため、RPGハブ固有の表示ロジックとして分離する。
export function getSeason(date: Date): Season {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export const SEASON_COLORS: Record<Season, { ground: string; sky: string }> = {
  autumn: { ground: "#d9a066", sky: "#ffe4b5" },
  spring: { ground: "#9bd18b", sky: "#dff4ff" },
  summer: { ground: "#65b96f", sky: "#bfe8ff" },
  winter: { ground: "#dce7ef", sky: "#d8e7f4" },
};
