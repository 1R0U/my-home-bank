import { Animated, View } from "react-native";
import DecorationIcon from "./DecorationIcon";
import { decorationStyles as styles } from "./decorationStyles";

/** 絵の大きさ（slotPicture と同じ）。指の真上に絵の中心が来るよう、半分ずらす */
const SIZE = 52;

/** 指に隠れないよう、絵を指より上に出す量 */
const LIFT = 44;

type Props = {
  assetId: string;
  /** 指の位置（3D表示の左上から）。描き直さずに動かすため Animated の値で受け取る */
  position: Animated.ValueXY;
};

/**
 * 下の一覧から引っぱっている装飾の絵。指について動く（Issue #477）。
 * 部屋の中の置き場所の目印は3D側が出す。こちらは「何を持っているか」を見せるだけ。
 * @param props - 引っぱっている装飾と指の位置
 * @returns 指についていく絵
 */
export default function DecorationDragGhost(props: Props) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        left: 0,
        position: "absolute",
        top: 0,
        transform: [
          { translateX: Animated.subtract(props.position.x, SIZE / 2) },
          { translateY: Animated.subtract(props.position.y, SIZE / 2 + LIFT) },
        ],
      }}
      testID="decoration-drag-ghost"
    >
      <View style={[styles.slotPicture, styles.ghostPicture]}>
        <DecorationIcon assetId={props.assetId} />
      </View>
    </Animated.View>
  );
}
