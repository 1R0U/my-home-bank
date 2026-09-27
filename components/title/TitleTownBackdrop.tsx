import { useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { createSetMapIntent, type RpgHubEvent } from "../../lib/rpg-hub/bridge";
import { DEFAULT_CHARACTER_TYPE } from "../../lib/rpg-hub/characterTypes";
import { INITIAL_MAP_OBJECTS } from "../../lib/rpg-hub/mapObjects";
import { SEASON_COLORS } from "../../lib/rpg-hub/seasonalLook";
import { useMapStore } from "../../store/mapStore";
import { RpgHubWebView, type RpgHubWebHandle } from "../rpg-hub-web/RpgHubWebView";

/**
 * タイトル画面の背景（Issue #309）。我が家タウンと同じ3Dの町を、町の中に立った目の高さから映す。
 *
 * シーンは我が家タウンと同じもの（webview/rpg-hub/scene.ts）を `title` モードで動かす。
 * プレイヤーは出さず、タップにも反応しない（タップはタイトル画面側が受ける）。
 *
 * **町は固定物（`INITIAL_MAP_OBJECTS`）だけを映す。** まだ誰もログインしていないので、
 * 置いた装飾（人ごとの庭）は出さない。
 *
 * Web では WebView が動かないため、`TitleTownBackdrop.web.tsx`（2Dの絵）に差し替わる。
 */

/** シーンの準備ができてから、覆いを外すまでの時間（ミリ秒）。組み立て途中の町を見せないため */
const REVEAL_DELAY_MS = 150;

/** 覆いを外すのにかける時間（ミリ秒） */
const REVEAL_DURATION_MS = 600;

/**
 * タイトル画面の背景の3Dの町（端末用）。画面いっぱいに敷き、タップは受けない。
 */
export function TitleTownBackdrop() {
  const webViewRef = useRef<RpgHubWebHandle>(null);
  const season = useMapStore((state) => state.currentSeason);
  // 目の高さから見ると画面の上半分は空になるので、覆いも空の色にする
  const skyColor = SEASON_COLORS[season].sky;
  // 準備ができるまで空の色で覆っておき、町ができたらふわっと見せる
  const cover = useRef(new Animated.Value(1)).current;

  /**
   * WebView からのイベントを受ける。使うのは準備完了（ready）だけ。
   * @param event - WebView から届いたイベント
   */
  const handleEvent = (event: RpgHubEvent) => {
    if (event.event !== "ready") return;
    // WebView が裏で再読み込みされると ready がもう一度来る。そのたびに町を送り直す
    webViewRef.current?.sendIntent(createSetMapIntent(INITIAL_MAP_OBJECTS, season));
    Animated.timing(cover, {
      delay: REVEAL_DELAY_MS,
      duration: REVEAL_DURATION_MS,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.noTouch, { backgroundColor: skyColor }]}
      testID="title-town-backdrop"
    >
      <RpgHubWebView
        ref={webViewRef}
        characterType={DEFAULT_CHARACTER_TYPE}
        mode="title"
        onEvent={handleEvent}
        // 準備中・失敗時は空の色だけにする。背景なので「準備中…」の文字は出さない
        placeholder={null}
      />
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: skyColor, opacity: cover }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  noTouch: {
    // 背景の町ではタップを受けない。画面のどこをタップしてもタイトル画面が受けられるように
    pointerEvents: "none",
  },
});
