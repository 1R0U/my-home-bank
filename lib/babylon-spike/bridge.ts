// Babylon スパイク（/babylon-spike）の RN ⇄ WebView ブリッジ。
//
// 設計方針: ブリッジでやり取りするのは「意図(intent)」と「イベント(event)」だけの
// 粗い JSON に限定する。RN 側から WebView 内の Babylon ノードを直接操作しない。
// （react-native-godot の Gate 0 調査で判明した「別 JS コンテキスト間のオブジェクト参照は
// 非互換」という制約を、そもそも踏まない設計にするための判断。docs 参照。）
//
// このモジュールは React Native / DOM に依存しない純粋関数のみ。
// WebView 側（sceneHtml.ts のインライン JS）と RN 側（BabylonSpikeView.tsx）の両方から使う。

/** RN → WebView。RN 側が WebView に送る意図。 */
export type BabylonIntent = { type: "setBalance"; value: number };

/** WebView → RN。WebView 側が RN に返すイベント。 */
export type BabylonEvent =
  | { event: "ready" }
  | { event: "tapped"; id: string }
  | { event: "error"; message: string };

type ParseResult =
  | { event: BabylonEvent; success: true }
  | { errors: string[]; success: false };

/**
 * 値がオブジェクト（配列でない）かどうかを判定する。
 * @param value - 判定する値
 * @returns オブジェクトの場合は true
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 残高表示の意図を組み立てる。
 * @param value - WebView に表示させたい残高
 * @returns setBalance 意図
 */
export function createSetBalanceIntent(value: number): BabylonIntent {
  return { type: "setBalance", value };
}

/**
 * 意図を WebView へ送るための文字列にシリアライズする。
 * @param intent - 送信する意図
 * @returns postMessage / injectedJavaScript に渡す JSON 文字列
 */
export function encodeIntent(intent: BabylonIntent): string {
  return JSON.stringify(intent);
}

/**
 * WebView 側で受け取った意図文字列をパースし、型と内容を検証する。
 * 未知の type や不正な値は破棄する。
 * @param raw - WebView の message イベントで受け取った文字列
 * @returns 成功時は検証済みの意図、失敗時はエラーメッセージ配列
 */
export function parseIntent(
  raw: unknown,
): { errors: string[]; success: false } | { intent: BabylonIntent; success: true } {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { errors: ["JSONとして解釈できません"], success: false };
    }
  }
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };

  if (value.type === "setBalance") {
    if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
      return { errors: ["valueが有限数値ではありません"], success: false };
    }
    return { intent: { type: "setBalance", value: value.value }, success: true };
  }

  return { errors: [`未知のtypeです: ${String(value.type)}`], success: false };
}

/**
 * WebView から RN へ返すイベントをパースし、型と内容を検証する。
 * 未知の event や不正な値は破棄する。
 * @param raw - onMessage で受け取った文字列（または既にパース済みのオブジェクト）
 * @returns 成功時は検証済みのイベント、失敗時はエラーメッセージ配列
 */
export function parseBabylonEvent(raw: unknown): ParseResult {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { errors: ["JSONとして解釈できません"], success: false };
    }
  }
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };

  if (value.event === "ready") {
    return { event: { event: "ready" }, success: true };
  }

  if (value.event === "tapped") {
    const id = typeof value.id === "string" && value.id.trim() ? value.id : null;
    if (!id) return { errors: ["idが不正です"], success: false };
    return { event: { event: "tapped", id }, success: true };
  }

  if (value.event === "error") {
    const message = typeof value.message === "string" ? value.message : "";
    return { event: { event: "error", message }, success: true };
  }

  return { errors: [`未知のeventです: ${String(value.event)}`], success: false };
}
