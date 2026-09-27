import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { GuildTownScene } from "./GuildTownScene";

/**
 * タイトル画面の背景の Web 版（Issue #309）。
 *
 * 端末では我が家タウンと同じ3Dの町を映す（`TitleTownBackdrop.tsx`）が、Web では
 * WebView が動かないため、View で描いた2Dの町（`GuildTownScene`）で代わりにする。
 * 開発中にブラウザで画面の流れを確かめるためのもので、見た目の作り込みは端末側が本番。
 */

/**
 * 2色の間を `steps` 段に分けた色の一覧を作る（グラデーションのライブラリは入れていないため、
 * 細い帯を重ねて近い見た目にする）。
 */
function gradientBands(from: string, to: string, steps: number): string[] {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [a, b] = [parse(from), parse(to)];
  return Array.from({ length: steps }, (_, step) => {
    const t = steps === 1 ? 0 : step / (steps - 1);
    const rgb = a.map((value, i) => Math.round(value + (b[i] - value) * t));
    return `rgb(${rgb.join(",")})`;
  });
}

/** 空の色。我が家タウン（夏〜春）の空に合わせ、上から下へ明るくしていく */
const SKY_BANDS = gradientBands("#9fd8fb", "#eaf8ff", 32);

/** 地面（草地）の色。絵の下端の草地から続け、下へ少し濃くしていく */
const GROUND_BANDS = gradientBands("#8fcb7f", "#5fae66", 16);

/** 絵の下に敷く草地の高さ。「TAP TO START」とバージョン表記が乗る */
const GROUND_HEIGHT = 130;

type CloudProps = {
  /** 流れる速さ（片道にかかるミリ秒） */
  duration: number;
  left: number;
  size: number;
  top: number;
};

/**
 * 空をゆっくり行き来する雲。丸を3つ重ねて描く。
 */
function Cloud({ duration, left, size, top }: CloudProps) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          duration,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          duration,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [drift, duration]);

  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.8] });

  return (
    <Animated.View
      style={{
        height: size * 0.6,
        left,
        position: "absolute",
        top,
        transform: [{ translateX }],
        width: size * 1.4,
      }}
    >
      <View style={[styles.cloudPuff, { height: size * 0.4, left: 0, top: size * 0.2, width: size * 0.7 }]} />
      <View style={[styles.cloudPuff, { height: size * 0.6, left: size * 0.3, top: 0, width: size * 0.6 }]} />
      <View style={[styles.cloudPuff, { height: size * 0.4, left: size * 0.7, top: size * 0.2, width: size * 0.7 }]} />
    </Animated.View>
  );
}

export function TitleTownBackdrop() {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.noTouch]}
      testID="title-town-backdrop"
    >
      <View style={StyleSheet.absoluteFill}>
        {SKY_BANDS.map((color, index) => (
          <View key={index} style={{ backgroundColor: color, flex: 1 }} />
        ))}
      </View>

      <View style={styles.sky}>
        {/* カードの下の、空いている空に浮かべる */}
        <Cloud duration={9000} left={10} size={70} top={240} />
        <Cloud duration={12000} left={230} size={56} top={300} />
        <Cloud duration={10000} left={140} size={40} top={220} />
      </View>

      <View style={styles.sceneWrap}>
        <GuildTownScene />
      </View>

      <View style={{ height: GROUND_HEIGHT }}>
        {GROUND_BANDS.map((color, index) => (
          <View key={index} style={{ backgroundColor: color, flex: 1 }} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  noTouch: {
    pointerEvents: "none",
  },
  sky: {
    flex: 1,
  },
  sceneWrap: {
    overflow: "hidden",
  },
  cloudPuff: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    opacity: 0.9,
    position: "absolute",
  },
});
