import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { router, Stack } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GuildTownScene } from "../components/title/GuildTownScene";

/**
 * タイトル画面（Issue #286）。
 *
 * 未ログインで起動したときだけ、ログイン画面の前に表示する（`app/index.tsx`）。
 * ログイン済みなら経由せず、そのまま各自のホームへ進む。
 *
 * 画面のどこをタップしてもログイン画面へ進む（push なので、戻ればこの画面に帰ってくる）。
 * 家族登録へはログイン画面のリンクから進める。
 *
 * 見た目はホーム画面（我が家タウン）に合わせ、明るい空と草地、白いカードにしている。
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

const COLORS = {
  card: "rgba(255,255,255,0.92)",
  cardEdge: "#ffffff",
  badge: "#059669",
  badgeEdge: "#ffffff",
  eyebrow: "#047857",
  title: "#dc5a3f",
  titleShadow: "#fde2d6",
  ribbon: "#059669",
  ribbonText: "#ffffff",
  tapPill: "rgba(255,255,255,0.92)",
  tapText: "#334155",
  cloud: "#ffffff",
  version: "#ecfdf5",
} as const;

type CloudProps = {
  /** 流れる速さ（1往復にかかるミリ秒） */
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

/**
 * 「TAP TO START」の文字。上下にぷかぷか浮かせる。
 */
function FloatingTapToStart({ onPress }: { onPress: () => void }) {
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [float]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    // 背景のタップは読み上げの対象にしていないため、ここを「はじめる」ボタンとして読ませる
    <Pressable
      accessibilityLabel="タップしてはじめる"
      accessibilityRole="button"
      onPress={onPress}
      style={styles.tapWrap}
      testID="title-tap-to-start"
    >
      <Animated.View style={[styles.tapPill, { transform: [{ translateY }] }]}>
        <Text style={styles.tapToStart}>TAP TO START</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function TitleScreen() {
  const version = Constants.expoConfig?.version;
  const goLogin = () => router.push("/login");

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* 空（背景）と雲 */}
      <View style={[StyleSheet.absoluteFill, styles.noTouch]}>
        {SKY_BANDS.map((color, index) => (
          <View key={index} style={{ backgroundColor: color, flex: 1 }} />
        ))}
        {/* カードの下の、空いている空に浮かべる */}
        <Cloud duration={9000} left={10} size={70} top={240} />
        <Cloud duration={12000} left={230} size={56} top={300} />
        <Cloud duration={10000} left={140} size={40} top={220} />
      </View>

      {/* 画面のどこをタップしてもログインへ進める。
          スクリーンリーダーでは1つのボタンにまとめず、看板の文字を個別に読ませる。
          ログイン操作は下の「TAP TO START」ボタンで行える */}
      <Pressable
        accessible={false}
        onPress={goLogin}
        style={styles.stage}
        testID="title-stage"
      >
        <SafeAreaView edges={["top"]} style={styles.stageArea}>
          <View style={styles.signWrap}>
            <View style={styles.cardShadow}>
              <View style={styles.card}>
                <Text style={styles.eyebrow}>OUCHI GUILD</Text>
                <Text accessible accessibilityRole="header" style={styles.title}>
                  おうちギルド
                </Text>
                <View style={styles.ribbon}>
                  <Text accessible style={styles.ribbonText}>
                    家族のクエストで ゴルをかせごう
                  </Text>
                </View>
              </View>
            </View>

            {/* カードの上のバッジ */}
            <View style={styles.badge}>
              <Ionicons color="#ffffff" name="home" size={20} />
            </View>
          </View>

          <View style={styles.sceneWrap}>
            <GuildTownScene />
          </View>
        </SafeAreaView>

        {/* 地面 */}
        <View style={styles.ground}>
          <View style={[StyleSheet.absoluteFill, styles.noTouch]}>
            {GROUND_BANDS.map((color, index) => (
              <View key={index} style={{ backgroundColor: color, flex: 1 }} />
            ))}
          </View>

          <SafeAreaView edges={["bottom"]} style={styles.groundContent}>
            <FloatingTapToStart onPress={goLogin} />
            {version ? <Text style={styles.version}>ver {version}</Text> : null}
          </SafeAreaView>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  noTouch: {
    pointerEvents: "none",
  },
  root: {
    backgroundColor: GROUND_BANDS[GROUND_BANDS.length - 1],
    flex: 1,
  },
  stage: {
    flex: 1,
  },
  stageArea: {
    flex: 1,
  },
  cloudPuff: {
    backgroundColor: COLORS.cloud,
    borderRadius: 999,
    opacity: 0.9,
    position: "absolute",
  },
  signWrap: {
    alignItems: "center",
    // 画面が低いと建物の絵がカードの裏まで伸びるので、カードを手前に出す
    zIndex: 1,
    marginHorizontal: 20,
    marginTop: 12,
    paddingTop: 22,
  },
  cardShadow: {
    alignSelf: "stretch",
    borderRadius: 28,
    elevation: 6,
    shadowColor: "#0f172a",
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  card: {
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderColor: COLORS.cardEdge,
    borderRadius: 28,
    borderWidth: 3,
    overflow: "hidden",
    paddingBottom: 18,
    paddingHorizontal: 16,
    paddingTop: 30,
  },
  badge: {
    alignItems: "center",
    backgroundColor: COLORS.badge,
    borderColor: COLORS.badgeEdge,
    borderRadius: 22,
    borderWidth: 3,
    height: 44,
    justifyContent: "center",
    position: "absolute",
    top: 0,
    width: 44,
  },
  eyebrow: {
    color: COLORS.eyebrow,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 4,
  },
  title: {
    color: COLORS.title,
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 2,
    textShadowColor: COLORS.titleShadow,
    textShadowOffset: { height: 3, width: 0 },
    textShadowRadius: 1,
  },
  ribbon: {
    backgroundColor: COLORS.ribbon,
    borderRadius: 999,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  ribbonText: {
    color: COLORS.ribbonText,
    fontSize: 12,
    fontWeight: "800",
  },
  sceneWrap: {
    flex: 1,
    justifyContent: "flex-end",
    marginTop: 8,
    overflow: "hidden",
  },
  ground: {
    marginTop: -2,
  },
  groundContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  tapWrap: {
    alignItems: "center",
    marginBottom: 16,
    // ぷかぷか浮いた分が上の絵に切られないよう、余白を持たせる
    paddingTop: 10,
  },
  tapPill: {
    backgroundColor: COLORS.tapPill,
    borderRadius: 999,
    elevation: 4,
    paddingHorizontal: 28,
    paddingVertical: 12,
    shadowColor: "#0f172a",
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  tapToStart: {
    color: COLORS.tapText,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 4,
    textAlign: "center",
  },
  version: {
    color: COLORS.version,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: "center",
  },
});
