import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { resolveSupabaseConfig } from "./supabaseConfig";

const { url: supabaseUrl, anonKey: supabaseAnonKey } = resolveSupabaseConfig(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);

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
