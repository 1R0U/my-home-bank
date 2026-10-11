import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import WalkingCharacter from "./WalkingCharacter";
import { travelLoadingStyles } from "./travelLoadingStyles";

/** 「いどうちゅう」の後ろの点を1つ増やす間隔（ミリ秒） */
const DOT_INTERVAL_MS = 400;

/** 点の数の最大。0個 → 3個 を繰り返す */
const MAX_DOTS = 3;

type Props = {
  /**
   * ほかの画面の上に重ねて出すか。
   * 重ねるときは、下にある画面（読み込み中の我が家タウンなど）を覆って、触れないようにする。
   */
  overlay?: boolean;
};

/**
 * 読み込み中の画面（Issue #261）。我が家タウンに入るとき・タウンから建物へ入るときに出す。
 *
 * 真ん中で自分のキャラクターが歩き（`WalkingCharacter`）、その下に「いどうちゅう」と出す。
 * 町の中を歩いて移動している途中、という見せ方にしてある。
 */
export default function TravelLoadingScreen({ overlay = false }: Props) {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDots((current) => (current + 1) % (MAX_DOTS + 1)), DOT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <View
      accessibilityLabel="いどうちゅう"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessible
      style={[travelLoadingStyles.screen, overlay ? travelLoadingStyles.overlay : null]}
      testID="travel-loading-screen"
    >
      <View style={travelLoadingStyles.stage}>
        <View style={travelLoadingStyles.shadow} />
        <WalkingCharacter />
      </View>
      <View style={travelLoadingStyles.labelRow}>
        <Text style={travelLoadingStyles.label}>いどうちゅう</Text>
        {/* 点の数で文字の幅が変わり、「いどうちゅう」が左右に揺れないよう、3つ分の場所を取っておく */}
        {Array.from({ length: MAX_DOTS }, (_, index) => (
          <Text key={index} style={[travelLoadingStyles.dot, { opacity: index < dots ? 1 : 0 }]}>
            .
          </Text>
        ))}
      </View>
    </View>
  );
}
