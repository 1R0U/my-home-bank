import { Redirect } from "expo-router";
import { resolveRootScreen } from "../lib/rootScreen";
import { useActiveRole } from "../store";

/**
 * アプリのルート（`/`）。役割を見て、対応するホーム画面のルートへ振り分ける。
 *
 * ここでは画面を直接描画せず、リダイレクトだけを行う（Issue #205）。実体を
 * `main-adult` / `rpg-hub` 側だけに置くことで、同じ画面に2つのルートが
 * できるのを防ぐ。大人用ホームについては、`(adult)` タブグループ配下で
 * マウントさせる目的もある（直接描画するとタブバーが出ない）。
 *
 * 未ログイン時はタイトル画面へ進み、そこからログイン画面へ進む（`resolveRootScreen`／Issue #286）。
 * ログイン済みならタイトル画面は経由しない（毎回挟むと煩わしいため）。
 */
export default function HomeScreen() {
  const role = useActiveRole();
  const rootScreen = resolveRootScreen(role);

  if (rootScreen === "title") {
    return <Redirect href="/title" />;
  }

  if (rootScreen === "parent") {
    // 大人用ホームは (adult) タブグループ配下の画面なので、ここで直接描画すると
    // タブバーの無い状態で表示されてしまう。/main-adult へリダイレクトして
    // 必ずタブレイアウト経由でマウントされるようにする。
    return <Redirect href="/main-adult" />;
  }

  if (rootScreen === "child") {
    // 子供のホームはRPGハブ（我が家タウン）。実体は /rpg-hub だけに置く（Issue #205 / #245）。
    // ここで直接描画すると、ログインからは / 、家族登録からは /rpg-hub と
    // 同じ画面に2つのルートができ、戻り先やWebのURLがルートによってずれる。
    // 大人も同じ /rpg-hub へ入る（大人はホーム画面のボタンから／Issue #246）。
    return <Redirect href="/rpg-hub" />;
  }
}
