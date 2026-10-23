import { type MutableRefObject, type RefObject, useEffect } from "react";
import {
  createSetMapIntent,
  createSetPlayerEquipmentIntent,
  createSetPlayerPaletteIntent,
  createSetSeasonIntent,
} from "../../lib/rpg-hub/bridge";
import type { CharacterType } from "../../lib/rpg-hub/characterTypes";
import type { EquipmentMap } from "../../lib/rpg-hub/equipment";
import type { Palette } from "../../lib/rpg-hub/palette";
import type { MapObject, Season } from "../../types/map";
import type { RpgHubWebHandle } from "./RpgHubWebView";

type SceneSyncState = {
  /** シーンが準備できるたびに増える世代。0 ならまだ準備できていない */
  sceneGeneration: number;
  objects: MapObject[];
  currentSeason: Season;
  /** setMap に添える今の季節（季節の変化では setMap を送り直さないため ref で渡す） */
  currentSeasonRef: MutableRefObject<Season>;
  equipment: EquipmentMap;
  palette: Palette;
  isPaletteReady: boolean;
  paletteCharacterType: CharacterType;
  /** 実際にシーンを作った種類。色はこれと同じ種類のものだけ送る */
  sceneCharacterType: CharacterType;
};

/**
 * RN 側の状態（マップ・季節・装備・色）を WebView のシーンへ送り込む（Issue #399 で
 * RpgHubScreen から切り出した）。
 *
 * どれも「シーンが準備できるたび（初回・再ロード後）」と「値が変わるたび」に送る。
 * WebView がバックグラウンド復帰などで再ロードすると、シーンは既定の状態に戻るため。
 */
export function useHubSceneSync(webViewRef: RefObject<RpgHubWebHandle>, state: SceneSyncState): void {
  const {
    currentSeason,
    currentSeasonRef,
    equipment,
    isPaletteReady,
    objects,
    palette,
    paletteCharacterType,
    sceneCharacterType,
    sceneGeneration,
  } = state;

  // シーンが準備できるたび（初回・再ロード後）と、マップが差し替わったときに送り込む。
  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(createSetMapIntent(objects, currentSeasonRef.current));
  }, [objects, sceneGeneration]);

  // 季節が変わったら、見た目だけを切り替える（Issue #282）。
  // シーンの再生成直後にも届くが、setMap と同じ季節なら WebView 側が何もしない。
  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(createSetSeasonIntent(currentSeason));
  }, [currentSeason, sceneGeneration]);

  // 着せ替えの結果をキャラクターへ反映する。
  // シーンが再生成されたときも送り直す。**再生成直後は何も着ていない状態**なので、
  // 送り直さないとバックグラウンド復帰のたびに裸になる。
  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(createSetPlayerEquipmentIntent(equipment));
  }, [equipment, sceneGeneration]);

  // 本人の色をキャラクターへ反映する。装備と同じく、シーンが再生成されたら送り直す
  // （再生成直後は既定の色に戻っているため）。isPaletteReady が立つまでは送らない
  // （前の利用者の色が一瞬映るのを防ぐため。PR #296レビュー対応）。
  useEffect(() => {
    if (sceneGeneration === 0 || !isPaletteReady || paletteCharacterType !== sceneCharacterType) return;
    webViewRef.current?.sendIntent(createSetPlayerPaletteIntent(palette));
  }, [isPaletteReady, palette, paletteCharacterType, sceneCharacterType, sceneGeneration]);
}
