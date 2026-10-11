import { File, Paths } from "expo-file-system";
import { encodeWalkFramesCache, parseWalkFramesCache, type WalkFrames } from "./rpg-hub/walkFramesCache";

/**
 * 歩きのコマ絵（Issue #261）を残しておくファイル。
 *
 * 残すのは最後に描いた1組だけ。端末を使う人の姿が変われば描き直して上書きする。
 * キャッシュ用の場所（`Paths.cache`）ではなくアプリの書類の場所に置くのは、
 * 端末の空きが少ないときに OS に消されて、起動のたびに描き直すことにならないようにするため。
 */
const FILE_NAME = "walk-frames.json";

/**
 * 残しておいたコマ絵を読む。
 * @returns 読めたコマ絵。無い・壊れているときは null
 */
export async function loadWalkFrames(): Promise<WalkFrames | null> {
  const file = new File(Paths.document, FILE_NAME);
  if (!file.exists) return null;
  return parseWalkFramesCache(await file.text());
}

/**
 * コマ絵を残す。前に残したものは上書きする。
 * @param walkFrames - 残すコマ絵
 */
export function saveWalkFrames(walkFrames: WalkFrames): void {
  const file = new File(Paths.document, FILE_NAME);
  if (file.exists) file.delete();
  file.create();
  file.write(encodeWalkFramesCache(walkFrames));
}
