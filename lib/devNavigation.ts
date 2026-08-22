import { DEV_ROLE_OVERRIDE } from "./devRole";
import { shouldEnableMockLogin } from "./devEnvironment";

const appVariant = process.env.EXPO_PUBLIC_APP_VARIANT;

/**
 * 通常の開発起動ではモックログインでき、将来のテスト用ビルドでも有効にする。
 * ロール確認用コマンド（start:parent / start:child）では従来どおり各ホーム画面を表示する。
 * 本番ビルドでは EXPO_PUBLIC_APP_VARIANT を設定しない（または production にする）。
 *
 * TODO: 本番用／テスト用のビルドプロファイルが整備されたら __DEV__ のフォールバックを削除し、
 * EXPO_PUBLIC_APP_VARIANT=test のテスト用ビルドだけでモックログインを有効にする。
 */
/** 開発・テスト環境でのみモックログインを有効にする。 */
export const SHOULD_ENABLE_MOCK_LOGIN = shouldEnableMockLogin(
  __DEV__,
  appVariant,
  DEV_ROLE_OVERRIDE,
);
