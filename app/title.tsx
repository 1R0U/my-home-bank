import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { router, Stack } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GuildTownScene } from "../components/title/GuildTownScene";

/**
 * タイトル画面（Issue #286）。
 *
 * 未ログインで起動したときだけ、ログイン画面の前に表示する（`app/index.tsx`）。
 * ログイン済みなら経由せず、そのまま各自のホームへ進む。
 *
 * - 画面のどこか（背景）をタップするか「ぼうけんをはじめる」でログイン画面へ
 * - 「ギルドにとうろくする」で家族登録画面へ
 *
 * どちらも push で進み、戻ればこの画面に帰ってくる。
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

/** 空の色。上から下へ明るく、かすんだ色にしていく */
const SKY_BANDS = gradientBands("#7c9dbc", "#d4d2c6", 32);

/** 地面（草地）の色。上から下へ暗くしていく */
const GROUND_BANDS = gradientBands("#4f5d2e", "#1a1d11", 24);

const COLORS = {
  ropeDark: "#5a3a1f",
  ropeLight: "#8a6536",
  boardEdge: "#e1b86a",
  boardEdgeDark: "#3f2413",
  board: "#7a4a28",
  boardPlankLine: "#5f3820",
  rivet: "#f0cf7c",
  shield: "#b8453a",
  shieldEdge: "#f0c35c",
  title: "#ffd978",
  titleOutline: "#3a1f0e",
  subtitle: "#f6dca0",
  ribbon: "#f5d35a",
  ribbonText: "#4a2a12",
  tapText: "#fff8e6",
  primary: "#f7d25a",
  primaryEdge: "#b98622",
  primaryText: "#4a2a12",
  secondary: "#f4ead3",
  secondaryEdge: "#a88a5c",
  secondaryText: "#3d2413",
  version: "#d8d2c0",
} as const;

/** 看板の板の継ぎ目を入れる位置（上端からの割合） */
const PLANK_LINES = ["25%", "50%", "75%"] as const;

export default function TitleScreen() {
  const version = Constants.expoConfig?.version;
  const goLogin = () => router.push("/login");
  const goRegister = () => router.push("/family-registration");

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* 空（背景） */}
      <View style={[StyleSheet.absoluteFill, styles.noTouch]}>
        {SKY_BANDS.map((color, index) => (
          <View key={index} style={{ backgroundColor: color, flex: 1 }} />
        ))}
      </View>

      <SafeAreaView edges={["top"]} style={styles.stageArea}>
        {/* 背景のどこをタップしてもログインへ進める */}
        <Pressable
          accessibilityHint="ログイン画面へ進みます"
          accessibilityLabel="タップしてはじめる"
          accessibilityRole="button"
          onPress={goLogin}
          style={styles.stage}
        >
          <View style={styles.signWrap}>
            <View style={styles.ropes}>
              <View style={styles.rope} />
              <View style={styles.rope} />
            </View>

            <View style={styles.boardShadow}>
              <View style={styles.board}>
                {PLANK_LINES.map((top) => (
                  <View key={top} style={[styles.plankLine, { top }]} />
                ))}
                <View style={[styles.rivet, { left: 8, top: 8 }]} />
                <View style={[styles.rivet, { right: 8, top: 8 }]} />
                <View style={[styles.rivet, { bottom: 8, left: 8 }]} />
                <View style={[styles.rivet, { bottom: 8, right: 8 }]} />

                <Text style={styles.eyebrow}>OUCHI GUILD</Text>
                <Text accessibilityRole="header" style={styles.title}>
                  おうちギルド
                </Text>
                <View style={styles.ribbon}>
                  <Text style={styles.ribbonText}>家族のクエストで コインをかせごう</Text>
                </View>
              </View>
            </View>

            {/* 看板の上の盾 */}
            <View style={styles.shield}>
              <Ionicons color={COLORS.shieldEdge} name="home" size={20} />
            </View>
          </View>

          <View style={styles.sceneWrap}>
            <GuildTownScene />
          </View>
        </Pressable>
      </SafeAreaView>

      {/* 地面とボタン */}
      <View style={styles.ground}>
        <View style={[StyleSheet.absoluteFill, styles.noTouch]}>
          {GROUND_BANDS.map((color, index) => (
            <View key={index} style={{ backgroundColor: color, flex: 1 }} />
          ))}
        </View>

        <SafeAreaView edges={["bottom"]} style={styles.groundContent}>
          <Text style={styles.tapToStart}>TAP TO START</Text>

          <Pressable
            accessibilityRole="button"
            onPress={goLogin}
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.buttonText, { color: COLORS.primaryText }]}>
              ぼうけんをはじめる
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={goRegister}
            style={({ pressed }) => [
              styles.button,
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>
              ギルドにとうろくする
            </Text>
          </Pressable>

          {version ? <Text style={styles.version}>ver {version}</Text> : null}
        </SafeAreaView>
      </View>
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
  stageArea: {
    flex: 1,
  },
  stage: {
    flex: 1,
  },
  signWrap: {
    alignItems: "center",
    // 画面が低いと建物の絵が看板の裏まで伸びるので、看板を手前に出す
    zIndex: 1,
    marginHorizontal: 20,
    marginTop: 4,
    paddingTop: 26,
  },
  ropes: {
    flexDirection: "row",
    height: 30,
    justifyContent: "space-between",
    position: "absolute",
    top: 0,
    width: "80%",
  },
  rope: {
    backgroundColor: COLORS.ropeLight,
    borderColor: COLORS.ropeDark,
    borderRadius: 2,
    borderWidth: 1,
    width: 5,
  },
  boardShadow: {
    alignSelf: "stretch",
    borderRadius: 18,
    elevation: 8,
    shadowColor: "#000000",
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  board: {
    alignItems: "center",
    backgroundColor: COLORS.board,
    borderColor: COLORS.boardEdge,
    borderRadius: 18,
    borderWidth: 4,
    overflow: "hidden",
    paddingBottom: 18,
    paddingHorizontal: 16,
    paddingTop: 30,
  },
  plankLine: {
    backgroundColor: COLORS.boardPlankLine,
    height: 2,
    left: 0,
    opacity: 0.7,
    position: "absolute",
    right: 0,
  },
  rivet: {
    backgroundColor: COLORS.rivet,
    borderColor: COLORS.boardEdgeDark,
    borderRadius: 5,
    borderWidth: 1,
    height: 10,
    position: "absolute",
    width: 10,
  },
  shield: {
    alignItems: "center",
    backgroundColor: COLORS.shield,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderColor: COLORS.shieldEdge,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderWidth: 3,
    height: 44,
    justifyContent: "center",
    position: "absolute",
    top: 4,
    width: 40,
  },
  eyebrow: {
    color: COLORS.subtitle,
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
    textShadowColor: COLORS.titleOutline,
    textShadowOffset: { height: 3, width: 0 },
    textShadowRadius: 1,
  },
  ribbon: {
    backgroundColor: COLORS.ribbon,
    borderColor: COLORS.boardEdgeDark,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
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
    paddingTop: 16,
  },
  tapToStart: {
    color: COLORS.tapText,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 3,
    marginBottom: 14,
    textAlign: "center",
    textShadowColor: "#000000",
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 3,
  },
  button: {
    alignItems: "center",
    borderBottomWidth: 5,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 12,
    paddingVertical: 15,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryEdge,
  },
  secondaryButton: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondaryEdge,
    paddingVertical: 12,
  },
  buttonPressed: {
    borderBottomWidth: 2,
    marginTop: 3,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2,
  },
  secondaryButtonText: {
    color: COLORS.secondaryText,
    fontSize: 15,
  },
  version: {
    color: COLORS.version,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
    textAlign: "center",
  },
});
