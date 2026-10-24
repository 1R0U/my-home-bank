import { type ComponentRef, type Ref, useState } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

type PressableBoxProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** 押している間だけ style の後ろに足すスタイル */
  pressedStyle?: StyleProp<ViewStyle>;
  /** 中の Pressable へそのまま渡す（React 19 では ref も props として届く） */
  ref?: Ref<ComponentRef<typeof Pressable>>;
};

/**
 * 押している間だけ見た目を変えるボタン。
 * Pressable の style を関数（`({ pressed }) => [...]`）で渡すと、実機（Expo Go）で背景・枠・余白が
 * すべて付かなかった（Issue #487 / #502）。押している状態をここで持ち、Pressable には配列の style だけを渡す。
 */
export default function PressableBox({ style, pressedStyle, onPressIn, onPressOut, ref, ...props }: PressableBoxProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...props}
      ref={ref}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={[style, pressed && pressedStyle]}
    />
  );
}
