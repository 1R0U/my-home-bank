import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { createChangeTrackingFetch } from "./dataFreshness";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase env vars are missing. Copy .env.example to .env and fill in the values."
  );
}

/**
 * Expo用のストレージアダプター。
 * SecureStore は 2048 バイトの制限があるため、大きなトークン（JWT等）は AsyncStorage にフォールバック。
 * 古いエントリが現在のトークンを隠さないよう、両方のストアを常にチェック・クリアする。
 */
const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    const secure = await SecureStore.getItemAsync(key);
    if (secure !== null) return secure;
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (value.length > 2048) {
      await AsyncStorage.setItem(key, value);
      await SecureStore.deleteItemAsync(key);
    } else {
      await SecureStore.setItemAsync(key, value);
      await AsyncStorage.removeItem(key);
    }
  },
  removeItem: async (key: string) => {
    await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key);
  },
};

/** Supabase クライアントのシングルトンインスタンス */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === "web" ? undefined : ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Googleログイン（Issue #292）で使う。ネイティブアプリはURLフラグメント
    // （#access_token=...）を確実に受け取れないため、クエリ文字列で code を
    // 返す PKCE フローにする。
    //
    // クライアント全体の設定なので、メールアドレス新規登録の確認メールのリンクにも
    // 影響する（1R0Uレビュー対応）。実機で新規登録→確認メールのリンクを開く→
    // パスワードでログイン、まで確認済み（確認メールのリンク自体は、開いた先の
    // 画面が表示されないことがあるが、Supabase側の確認処理はリンクを開いた時点で
    // 完了しており、ログインには影響しない）。
    flowType: "pkce",
  },
  global: {
    // この端末からの書き込みを数え、フォーカス時の再取得を省いてよいかの判断に使う
    // （Issue #243、lib/dataFreshness.ts）。
    fetch: createChangeTrackingFetch((input, init) => fetch(input, init)),
  },
});
