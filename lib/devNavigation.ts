import { DEV_ROLE_OVERRIDE } from "./devRole";

const appVariant = process.env.EXPO_PUBLIC_APP_VARIANT;

/**
 * 通常の開発起動では Expo Go で画面確認でき、将来のテスト用ビルドでも有効にする。
 * ロール確認用コマンド（start:parent / start:child）では従来どおり各ホーム画面を表示する。
 * 本番ビルドでは EXPO_PUBLIC_APP_VARIANT を設定しない（または production にする）。
 *
 * TODO: 本番用／テスト用のビルドプロファイルが整備されたら __DEV__ のフォールバックを削除し、
 * EXPO_PUBLIC_APP_VARIANT=test のテスト用ビルドだけで開発ナビを表示する。
 */
export const SHOULD_SHOW_DEV_NAVIGATION =
  appVariant === "test" || (__DEV__ && DEV_ROLE_OVERRIDE === undefined);
