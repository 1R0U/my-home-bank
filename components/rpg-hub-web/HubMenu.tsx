import { useEffect, useRef } from "react";
import { Animated, Easing, ScrollView, Text, useWindowDimensions, View } from "react-native";
import TutorialPressable from "../tutorial/TutorialPressable";
import { useTutorial } from "../tutorial/TutorialContext";

/** メニューに並べるボタン1つぶん。 */
export type HubMenuItem = {
  accessibilityLabel: string;
  /** ボタンに出す絵文字 */
  icon: string;
  key: string;
  onPress: () => void | boolean;
};

type HubMenuProps = {
  items: readonly HubMenuItem[];
  onToggle: () => void;
  open: boolean;
};

/**
 * ボタン1つが出きるまでの時間（ミリ秒）。
 *
 * すぐ押したいメニューなので、ばねで弾ませず短く滑らせて出す。弾ませると
 * 出きるまでに時間がかかり、待たされる感じになった（実機確認での指摘）。
 */
const POP_DURATION_MS = 120;

/** 1つ目のボタンが出てから、次のボタンが出始めるまでの間（ミリ秒）。 */
const POP_STAGGER_MS = 20;

/**
 * RPGハブ右上のメニュー。ふだんはメニューボタン1つだけを出し、押すと
 * キャラ選び・かざる・きがえなどのボタンが、その下へ上から順にすっと出る。
 *
 * 開いた一覧は absolute で重ねず、レイアウトの流れの中に置いている。Android では
 * 親の範囲からはみ出した子をタップできないため、重ねると下のほうのボタンが押せなくなる。
 * 幅はボタン1つぶんで変わらないので、開いても同じ行のミニマップなどは動かない。
 * @param props - 並べるボタンと開閉の状態
 * @returns メニューボタンと、開いているときのボタン一覧
 */
export default function HubMenu({ items, onToggle, open }: HubMenuProps) {
  const tutorial = useTutorial();
  const { height } = useWindowDimensions();
  const advance = tutorial?.advance;
  const stepId = tutorial?.step?.id;
  useEffect(() => {
    // 先に開いていた場合は、そのまま設定の案内へ進める。
    if (open && stepId === "town-menu") advance?.("town-menu");
  }, [open, stepId, advance]);
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
        Animated.timing(value, {
          duration: POP_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ),
    );
    animation.start();
    return () => animation.stop();
    // 開いた瞬間にだけ動かす。開いたまま項目の数が変わっても、出し直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <View className="ml-2 items-center" pointerEvents="box-none">
      <TutorialPressable tutorialId={open ? undefined : "town-menu"}
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
      </TutorialPressable>
      {open && (
        <ScrollView className="mt-2" contentContainerStyle={{ alignItems: "center", gap: 8 }}
          style={{ width: 48, flexGrow: 0, maxHeight: tutorial?.mode === "running" ? Math.max(56, height * 0.6 - 160) : undefined }}
          scrollEnabled={tutorial?.mode === "running"} showsVerticalScrollIndicator={false}>
          {items.map((item, index) => {
            const pop = popValues.current[index];
            return (
              <Animated.View
                key={item.key}
                style={{
                  opacity: pop,
                  transform: [
                    { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                    { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
                  ],
                }}
              >
                <TutorialPressable tutorialId={item.key === "settings" ? "town-settings" : undefined}
                  accessibilityLabel={item.accessibilityLabel}
                  accessibilityRole="button"
                  className="h-12 w-12 items-center justify-center rounded-2xl bg-white/95 active:bg-slate-100"
                  onPress={item.onPress}
                >
                  <Text className="text-xl">{item.icon}</Text>
                </TutorialPressable>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
