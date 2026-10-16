import { ActivityIndicator, View } from "react-native";
import { UI_COLORS } from "../constants/ui";

type LoadingSpinnerProps = {
  /** 読み上げ用の文言（例: 「タスクを読み込み中」） */
  label: string;
  /** 外枠の className。既定は、置いた場所の残りいっぱいの真ん中に出す */
  className?: string;
};

/**
 * 大人用の画面の、読み込み中の表示（Issue #261）。真ん中でぐるぐる回る。
 *
 * 大人のホームから開く画面は、まだ何も出せないとき（最初の取得中）にこれを出す。
 * 以前は画面ごとに、素の `ActivityIndicator`・文字だけ・何も出さない、とばらばらで、
 * 何も出さない画面では取得中に「ありません」と出てしまうものもあった。
 *
 * 我が家タウンから建物へ入るときは、上に「いどうちゅう」の画面（`TravelLoadingOverlay`）が
 * 重なるので、これは見えない。画面の側で入り方を見分ける必要はない。
 */
export default function LoadingSpinner({ label, className }: LoadingSpinnerProps) {
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessible
      className={className ?? "flex-1 items-center justify-center py-10"}
      testID="loading-spinner"
    >
      <ActivityIndicator color={UI_COLORS.slate600} size="large" />
    </View>
  );
}
