import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { router, Stack } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TitleTownBackdrop } from "../components/title/TitleTownBackdrop";

/**
 * タイトル画面（Issue #286）。
 *
 * 未ログインで起動したときだけ、ログイン画面の前に表示する（`app/index.tsx`）。
 * ログイン済みなら経由せず、そのまま各自のホームへ進む。
 *
 * 画面のどこをタップしてもログイン画面へ進む（push なので、戻ればこの画面に帰ってくる）。
 * 家族登録へはログイン画面のリンクから進める。
 *
 * 背景には我が家タウンと同じ3Dの町を、町の中に立った目の高さから映す（`TitleTownBackdrop`）。
 * 文字は我が家タウンの案内と同じ、白い丸いカードに載せる。
 */

const COLORS = {
  card: "rgba(255,255,255,0.94)",
  cardEdge: "#ffffff",
  badge: "#059669",
  badgeEdge: "#ffffff",
  eyebrow: "#047857",
  title: "#dc5a3f",
  titleShadow: "#fde2d6",
  ribbon: "#059669",
  ribbonText: "#ffffff",
  tapPill: "rgba(255,255,255,0.94)",
  tapText: "#334155",
  version: "#ffffff",
} as const;

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

      <TitleTownBackdrop />

      {/* 画面のどこをタップしてもログインへ進める。
          スクリーンリーダーでは1つのボタンにまとめず、カードの文字を個別に読ませる。
          ログイン操作は下の「TAP TO START」ボタンで行える */}
      <Pressable
        accessible={false}
        onPress={goLogin}
        style={styles.stage}
        testID="title-stage"
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.stage}>
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

          {/* 町が見えるよう、カードとボタンの間は空けておく */}
          <View style={styles.spacer} />

          <FloatingTapToStart onPress={goLogin} />
          {version ? <Text style={styles.version}>ver {version}</Text> : null}
        </SafeAreaView>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    // 背景の町が出るまでの色。我が家タウンの空の色に合わせる
    backgroundColor: "#dff4ff",
    flex: 1,
  },
  stage: {
    flex: 1,
  },
  signWrap: {
    alignItems: "center",
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
  tapWrap: {
    alignItems: "center",
    marginBottom: 16,
    // ぷかぷか浮いた分がはみ出さないよう、余白を持たせる
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
  spacer: {
    flex: 1,
  },
  version: {
    color: COLORS.version,
    textShadowColor: "rgba(15,23,42,0.45)",
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: "center",
  },
});
