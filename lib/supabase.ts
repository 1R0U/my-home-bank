import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase env vars are missing. Copy .env.example to .env and fill in the values."
  );
}

if (supabaseUrl === "https://your-project-id.supabase.co" || supabaseAnonKey === "your-anon-key-here") {
  throw new Error(".env の Supabase URL と公開キーを実際のプロジェクトの値に設定してください");
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
  },
});
