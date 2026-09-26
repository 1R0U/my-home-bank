/**
 * ログインしていなくても開ける画面（Expo Router のルートの先頭の区切り）。
 *
 * **許可する画面を列挙し、それ以外はすべてログインを要求する**（Issue #274）。
 * 守る画面の側を列挙すると、画面を足したときに守り忘れても気づけないため。
 * ルートの `/`（`app/index.tsx`）は区切りが空で、未ログインなら自分でログイン画面へ送るので、
 * ここでは対象にしない。
 */
const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  "login",
  "family-registration",
  // Googleログイン（Issue #292）のOAuthコールバック先。認証の途中で、まだ
  // ログインしていない状態のまま届く（Android）ため、ここも許可する。
  "auth",
]);

/**
 * 今いる画面から、ログイン画面へ送り返すべきかを決める。
 *
 * セッションが切れたり、未ログインのまま URL で直接入ったりしたときに、モックの利用者の
 * 画面が黙って表示され続けないようにする（Issue #274）。
 * @param segments - 今いる画面のルートの区切り（`useSegments` の値）
 * @param isLoggedIn - ログインしているか
 * @param isPreview - 開発用ロール指定（`npm run start:parent` / `start:child`）で画面をプレビュー中か
 * @returns ログイン画面へ送り返すべきなら true
 */
export function shouldRedirectToLogin(
  segments: readonly string[],
  isLoggedIn: boolean,
  isPreview: boolean,
): boolean {
  // プレビューはログインせずに画面を見るための仕組みなので、送り返さない
  if (isLoggedIn || isPreview) return false;

  const first = segments[0];
  if (first === undefined) return false;
  // `+not-found` など Expo Router が用意する画面
  if (first.startsWith("+")) return false;
  return !PUBLIC_ROUTES.has(first);
}
