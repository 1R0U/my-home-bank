/**
 * ログインしていなくても開ける画面（Expo Router のルートの先頭の区切り）。
 *
 * **許可する画面を列挙し、それ以外はすべてログインを要求する**（Issue #274）。
 * 守る画面の側を列挙すると、画面を足したときに守り忘れても気づけないため。
 * ルートの `/`（`app/index.tsx`）は区切りが空で、未ログインなら自分でログイン画面へ送るので、
 * ここでは対象にしない。
 */
const PUBLIC_ROUTES: ReadonlySet<string> = new Set(["login", "family-registration"]);

/**
 * 開発ビルドのときだけログイン不要で開ける画面。
 *
 * 本番でもログインなしで開けてしまうと困る、確認専用の一時的な画面をここに置く。
 * `PUBLIC_ROUTES` と分けているのは、`isDevBuild` を確かめたときだけ許可するため
 * （1R0Uレビュー対応）。
 */
const DEV_ONLY_PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  // キャラクターの見た目を実機確認するための一時的な画面（Issue #287）。
  // 確認が終わったら app/character-preview.tsx と合わせて削除する。
  "character-preview",
]);

/**
 * 今いる画面から、ログイン画面へ送り返すべきかを決める。
 *
 * セッションが切れたり、未ログインのまま URL で直接入ったりしたときに、モックの利用者の
 * 画面が黙って表示され続けないようにする（Issue #274）。
 * @param segments - 今いる画面のルートの区切り（`useSegments` の値）
 * @param isLoggedIn - ログインしているか
 * @param isPreview - 開発用ロール指定（`npm run start:parent` / `start:child`）で画面をプレビュー中か
 * @param isDevBuild - 開発ビルドか（`__DEV__`）。呼び出し側から渡す（このファイルは
 *   plain Node（`node --test`）からも直接importされてテストされ、`__DEV__` が
 *   定義されていないため、ここでは直接参照しない）
 * @returns ログイン画面へ送り返すべきなら true
 */
export function shouldRedirectToLogin(
  segments: readonly string[],
  isLoggedIn: boolean,
  isPreview: boolean,
  isDevBuild: boolean,
): boolean {
  // プレビューはログインせずに画面を見るための仕組みなので、送り返さない
  if (isLoggedIn || isPreview) return false;

  const first = segments[0];
  if (first === undefined) return false;
  // `+not-found` など Expo Router が用意する画面
  if (first.startsWith("+")) return false;
  if (PUBLIC_ROUTES.has(first)) return false;
  if (isDevBuild && DEV_ONLY_PUBLIC_ROUTES.has(first)) return false;
  return true;
}
