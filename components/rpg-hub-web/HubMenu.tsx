import { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";

/** メニューに並べるボタン1つぶん。 */
export type HubMenuItem = {
  accessibilityLabel: string;
  /** ボタンに出す絵文字 */
  icon: string;
  key: string;
  onPress: () => void;
};

type HubMenuProps = {
  items: readonly HubMenuItem[];
  onToggle: () => void;
  open: boolean;
};

/** 1つ目のボタンが出てから、次のボタンが出始めるまでの間（ミリ秒）。 */
const POP_STAGGER_MS = 45;

/**
 * RPGハブ右上のメニュー。ふだんはメニューボタン1つだけを出し、押すと
 * キャラ選び・かざる・きがえなどのボタンが、その下へ1つずつポコンと出る。
 *
 * 開いた一覧は absolute で重ねず、レイアウトの流れの中に置いている。Android では
 * 親の範囲からはみ出した子をタップできないため、重ねると下のほうのボタンが押せなくなる。
 * 幅はボタン1つぶんで変わらないので、開いても横の見出しカードの幅は動かない。
 * @param props - 並べるボタンと開閉の状態
 * @returns メニューボタンと、開いているときのボタン一覧
 */
export default function HubMenu({ items, onToggle, open }: HubMenuProps) {
  // ボタンごとの出かた（0 = 隠れている、1 = 出きった）。数が変わることがある
  // （家の中だけ「そとへ」が出る）ので、足りないぶんはその場で作る
  const popValues = useRef<Animated.Value[]>([]);
  while (popValues.current.length < items.length) {
    popValues.current.push(new Animated.Value(0));
  }

  useEffect(() => {
    if (!open) return;
    const values = popValues.current.slice(0, items.length);
    values.forEach((value) => value.setValue(0));
    const animation = Animated.stagger(
      POP_STAGGER_MS,
      values.map((value) =>
        Animated.spring(value, { friction: 5, tension: 160, toValue: 1, useNativeDriver: true }),
      ),
    );
    animation.start();
    return () => animation.stop();
    // 開いた瞬間にだけ鳴らす。開いたまま項目の数が変わっても、出し直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <View className="ml-2 items-center" pointerEvents="box-none">
      <Pressable
        accessibilityLabel={open ? "メニューを閉じる" : "メニューを開く"}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className={`h-12 w-12 items-center justify-center rounded-2xl ${
          open ? "bg-slate-800 active:bg-slate-900" : "bg-white/90 active:bg-white"
        }`}
        onPress={onToggle}
      >
        <Text className={`text-2xl ${open ? "text-white" : "text-slate-800"}`}>
          {open ? "✕" : "☰"}
        </Text>
      </Pressable>
      {open && (
        <View className="mt-2 items-center gap-2" pointerEvents="box-none">
          {items.map((item, index) => {
            const pop = popValues.current[index];
            return (
              <Animated.View
                key={item.key}
                style={{
                  opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
                  transform: [
                    { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
                    { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                  ],
                }}
              >
                <Pressable
                  accessibilityLabel={item.accessibilityLabel}
                  accessibilityRole="button"
                  className="h-12 w-12 items-center justify-center rounded-2xl bg-white/95 active:bg-slate-100"
                  onPress={item.onPress}
                >
                  <Text className="text-xl">{item.icon}</Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      )}
    </View>
  );
}
