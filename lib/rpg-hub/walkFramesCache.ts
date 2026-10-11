// 歩きのコマ絵（Issue #261）を、アプリを閉じても残しておくための読み書きの形。
//
// コマ絵は見えない WebView で3Dを描いて作るので、できるまでに数秒かかる。読み込み中の画面は
// まさにその数秒に出るため、毎回描いていては、歩く姿が出る前に読み込みが終わってしまう。
// 一度描いたものをファイルに残し、次にアプリを開いたときはすぐ出せるようにする。
//
// ファイルの読み書き自体は lib/walkFramesFile.ts。ここは中身の組み立てと検証だけを持つ
// 純粋関数で、`node --test` で確かめる。

import { parsePortraitEvent } from "./portraitBridge.ts";

/**
 * 保存する形の版。**コマ絵の描き方（カメラの向き・枚数・弾み方など）を変えたら1つ上げる。**
 * 上げると、前の描き方で残したコマ絵は読み込まれず、描き直される。
 */
export const WALK_FRAMES_CACHE_VERSION = 1;

/** 歩きのコマ絵1組。どの見た目のものか（`getWalkFramesKey`）と、位相の順に並べた画像。 */
export type WalkFrames = { frames: string[]; key: string };

/**
 * 保存する文字列を作る。
 * @param walkFrames - 保存するコマ絵
 * @returns JSON 文字列
 */
export function encodeWalkFramesCache(walkFrames: WalkFrames): string {
  return JSON.stringify({ ...walkFrames, version: WALK_FRAMES_CACHE_VERSION });
}

/**
 * 保存しておいた文字列を読む。
 *
 * 画像は WebView から受け取ったときと同じ検証（`parsePortraitEvent`）を通す。
 * ファイルが壊れていたり、前の版で保存したものだったりしたら null を返し、描き直してもらう。
 * @param text - 保存しておいた文字列
 * @returns 読めたコマ絵。読めなければ null
 */
export function parseWalkFramesCache(text: string): WalkFrames | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== WALK_FRAMES_CACHE_VERSION) return null;

  const result = parsePortraitEvent({ event: "walkFrames", frames: record.frames, key: record.key });
  if ("errors" in result || result.event.event !== "walkFrames") return null;
  return { frames: result.event.frames, key: result.event.key };
}
