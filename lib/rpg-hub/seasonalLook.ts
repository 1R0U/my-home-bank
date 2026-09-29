// RPGハブの季節ごとの見た目（Issue #282 / docs/RPG_HUB_ARCHITECTURE.md 7章）。
//
// **ここは「季節が決まったあと、どう見せるか」だけを持つ。** 季節の決め方は
// lib/rpg-hub/season.ts、地面に散らす飾りの置き方は lib/rpg-hub/seasonalDecorations.ts。
//
// WebView のシーン（webview/rpg-hub/scene.ts）がこの表を読んで Babylon へ反映する。
// Babylon には依存しない純粋なデータと関数だけを置き、テストで中身を押さえられるようにする。

import type { Season, SeasonSlot } from "../../types/map";

/** 季節ごとの地面と空の色（RPGハブ表示用） */
export const SEASON_COLORS: Record<Season, { ground: string; sky: string }> = {
  autumn: { ground: "#d9a066", sky: "#ffe4b5" },
  spring: { ground: "#9bd18b", sky: "#dff4ff" },
  summer: { ground: "#65b96f", sky: "#bfe8ff" },
  winter: { ground: "#dce7ef", sky: "#d8e7f4" },
};

/**
 * 平行光（太陽）の向き。影の落ちる向きもこれで決まる。
 * 照明の強さの上限（下の SEASON_LIGHTING）を決めるのにも使うので、シーンからここへ移した。
 */
export const SUN_DIRECTION = { x: -0.35, y: -1, z: -0.75 };

/** 光1つ分の色と強さ。 */
type Light = { color: string; intensity: number };

/** 季節1つ分の照明。 */
export type SeasonLighting = {
  /** 空全体からの光（環境光）。`groundColor` は下を向いた面に当たる光の色 */
  ambient: Light & { groundColor: string };
  /** 太陽（平行光） */
  sun: Light;
};

/**
 * 季節ごとの照明。
 *
 * **上を向いた面の明るさが、どの色の成分でも 1.0 を超えないようにしてある。**
 * 超えると素材の色がそのまま出ず、明るい色から順に白へ潰れる（Issue #214。
 * 以前は道の石色も春の地面も真っ白になり、道が見えなくなっていた）。
 * 計算は「環境光の強さ × 色 ＋ 太陽の強さ × 色 × 太陽の傾き」で、テストが押さえている。
 *
 * 季節の違いは主に**光の色**で出す。春は少し桃色、夏は白く強い日差し、
 * 秋は夕方のような橙、冬は青白く弱い日差し。
 */
export const SEASON_LIGHTING: Record<Season, SeasonLighting> = {
  autumn: {
    ambient: { color: "#fff0dc", groundColor: "#6b5a4a", intensity: 0.42 },
    sun: { color: "#ffdcb4", intensity: 0.72 },
  },
  spring: {
    ambient: { color: "#fff4f6", groundColor: "#666666", intensity: 0.42 },
    sun: { color: "#fff8ee", intensity: 0.72 },
  },
  summer: {
    ambient: { color: "#ffffff", groundColor: "#666666", intensity: 0.38 },
    sun: { color: "#fffbe6", intensity: 0.78 },
  },
  winter: {
    ambient: { color: "#e8f0ff", groundColor: "#6a7383", intensity: 0.48 },
    sun: { color: "#dde8ff", intensity: 0.62 },
  },
};

/** 部品の色を、季節の色へどれだけ寄せるか。 */
type SeasonTint = {
  /** 寄せる先の色 */
  color: string;
  /** 寄せる割合（0で元の色のまま、1で `color` そのもの） */
  amount: number;
};

/** 雪の色。冬に「雪をかぶる」部品はこの色へ寄せる。 */
const SNOW = "#f2f6fa";

/**
 * 季節ごとに、部品の種類をどの色へ寄せるか（Issue #282）。
 *
 * **色を置き換えず、元の色から寄せる。** 1本の木の葉は緑を少しずつ変えたかたまりで
 * できており（buildingParts.ts）、同じ色で塗りつぶすとその濃淡が消えて、
 * 塗った球にしか見えなくなるため。
 *
 * 載っていない組み合わせは元の色のまま。夏はすべて元の色（形を作ったときの色）にしてある。
 */
export const SEASON_TINTS: Record<Season, Partial<Record<SeasonSlot, SeasonTint>>> = {
  autumn: {
    blossom: { amount: 0.72, color: "#cf4a2c" },
    foliage: { amount: 0.7, color: "#e0892e" },
    grass: { amount: 0.55, color: "#c8a24e" },
  },
  spring: {
    blossom: { amount: 0.78, color: "#f7b9cf" },
    foliage: { amount: 0.3, color: "#9bdc6e" },
    grass: { amount: 0.25, color: "#8fd66d" },
  },
  summer: {},
  winter: {
    blossom: { amount: 0.62, color: SNOW },
    foliage: { amount: 0.55, color: SNOW },
    grass: { amount: 0.5, color: "#dde7e2" },
    // 針葉樹と屋根は、元の色が分かる程度に雪をかぶせる。屋根は建物の見分けに使っているため
    needle: { amount: 0.35, color: SNOW },
    roof: { amount: 0.45, color: SNOW },
  },
};

/** 16進カラーコード（#rrggbb）。 */
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * 2つの色を混ぜる。
 * @param from - 元の色（#rrggbb）
 * @param to - 混ぜる色（#rrggbb）
 * @param amount - `to` の割合（0〜1）
 * @returns 混ぜた色（#rrggbb、小文字）
 */
export function mixColor(from: string, to: string, amount: number): string {
  const ratio = Math.min(1, Math.max(0, amount));
  let mixed = "#";
  for (let index = 1; index < 7; index += 2) {
    const a = parseInt(from.slice(index, index + 2), 16);
    const b = parseInt(to.slice(index, index + 2), 16);
    const channel = Math.round(a + (b - a) * ratio);
    mixed += channel.toString(16).padStart(2, "0");
  }
  return mixed;
}

/**
 * 部品1つを、その季節に何色で描くかを決める。
 * @param color - 部品の元の色（#rrggbb）
 * @param slot - 部品の種類。無ければ季節で変わらない
 * @param season - 季節
 * @returns 描く色。季節で変わらない部品は `color` をそのまま返す
 */
export function resolveSeasonalColor(
  color: string,
  slot: SeasonSlot | undefined,
  season: Season,
): string {
  if (!slot || !COLOR_PATTERN.test(color)) return color;
  const tint = SEASON_TINTS[season][slot];
  return tint ? mixColor(color, tint.color, tint.amount) : color;
}

/** 空から舞い落ちる物（花びら・落ち葉・雪）の設定。 */
export type FallingParticles = {
  /** 1秒あたりに出す数 */
  emitRate: number;
  /** 色。2色のあいだでばらつかせる */
  colors: [string, string];
  /** 大きさの範囲（ワールド座標） */
  size: { max: number; min: number };
  /** 落ちる速さ（1秒あたりのワールド座標） */
  fallSpeed: number;
  /** 横へ流れる速さの最大（1秒あたりのワールド座標） */
  drift: number;
};

/**
 * 季節ごとに空から舞い落ちる物。夏は何も降らせない（null）。
 *
 * 数を増やすほど描く量が増えるので、画面に常に数十個見える程度にとどめる。
 */
export const SEASON_PARTICLES: Record<Season, FallingParticles | null> = {
  autumn: {
    colors: ["#e0892e", "#cf4a2c"],
    drift: 0.9,
    emitRate: 10,
    fallSpeed: 1.3,
    size: { max: 0.22, min: 0.14 },
  },
  spring: {
    colors: ["#fbd7e3", "#f7b3c9"],
    drift: 0.8,
    emitRate: 14,
    fallSpeed: 0.9,
    size: { max: 0.16, min: 0.1 },
  },
  summer: null,
  winter: {
    colors: ["#ffffff", "#e6effa"],
    drift: 0.35,
    emitRate: 30,
    fallSpeed: 1.1,
    size: { max: 0.14, min: 0.07 },
  },
};
