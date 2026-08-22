import { DEV_ROLE_OVERRIDE } from "./devRole";
import { shouldEnableMockLogin } from "./devEnvironment";

const appVariant = process.env.EXPO_PUBLIC_APP_VARIANT;

/**
 * 開発・テスト環境でのみモックログインを有効にする。
 * ロール固定起動時は、従来どおりログインを経由せず各ホーム画面を表示する。
 *
 * TODO: 本番用／テスト用のビルドプロファイルが整備されたら __DEV__ のフォールバックを削除する。
 */
export const SHOULD_ENABLE_MOCK_LOGIN = shouldEnableMockLogin(
  __DEV__,
  appVariant,
  DEV_ROLE_OVERRIDE,
);
