import { Redirect, Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SHOULD_ENABLE_MOCK_LOGIN } from "../lib/mockLoginEnvironment";
import { resolveRootScreen } from "../lib/rootScreen";
import { useActiveRole } from "../store";

/**
 * アプリのルート（`/`）。役割を見て、対応するホーム画面のルートへ振り分ける。
 *
 * ここでは画面を直接描画せず、リダイレクトだけを行う（Issue #205）。実体を
 * `main-adult` / `main-child` 側だけに置くことで、同じ画面に2つのルートが
 * できるのを防ぐ。大人用ホームについては、`(adult)` タブグループ配下で
 * マウントさせる目的もある（直接描画するとタブバーが出ない）。
 *
 * 未ログイン時は、モックログインの有効・無効で分岐する（`resolveRootScreen`）。
 */
export default function HomeScreen() {
  const role = useActiveRole();
  const rootScreen = resolveRootScreen(role, SHOULD_ENABLE_MOCK_LOGIN);

  if (rootScreen === "login") {
    return <Redirect href="/login" />;
  }

  if (rootScreen === "parent") {
    // 大人用ホームは (adult) タブグループ配下の画面なので、ここで直接描画すると
    // タブバーの無い状態で表示されてしまう。/main-adult へリダイレクトして
    // 必ずタブレイアウト経由でマウントされるようにする。
    return <Redirect href="/main-adult" />;
  }

  if (rootScreen === "child") {
    // 子供用ホームも実体は /main-child だけに置く（Issue #205）。
    // ここで直接描画すると、ログインからは / 、家族登録からは /main-child と
    // 同じ画面に2つのルートができ、戻り先やWebのURLがルートによってずれる。
    return <Redirect href="/main-child" />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-white p-6">
      <Text className="mb-8 text-3xl font-bold text-slate-900">我が家中央銀行</Text>
      <Link href="/bank" asChild>
        <Pressable className="rounded-3xl bg-slate-900 px-8 py-5 shadow-lg shadow-slate-300">
          <Text className="text-base font-semibold text-white">銀行に行く</Text>
        </Pressable>
      </Link>
    </View>
  );
}
