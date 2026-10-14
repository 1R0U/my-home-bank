import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_HOUSE_LAYOUT, parseHouseLayout, type HouseLayout } from "./rpg-hub/houseLayout";

/**
 * 家の中の配置（もようがえ）を、端末の中に保存する（Issue #425）。
 *
 * まずは端末の中だけで試し、使い勝手が決まったらDBへ移す予定。アプリを入れ直すと消える。
 * 利用者ごとに分けて保存する（同じ端末で兄弟がログインし直しても、配置が混ざらないように）。
 */

/** 保存の形を変えたら数字を上げる。古い形は読まずに、何も置いていない配置から始める */
const KEY_PREFIX = "house-layout:v1:";

function storageKey(ownerKey: string): string {
  return `${KEY_PREFIX}${ownerKey}`;
}

/**
 * 保存してある配置を読む。
 * @param ownerKey - 利用者を区別するキー（利用者ID。未ログインのときは決まった文字列）
 * @returns 配置。保存していない・読めないときは、何も置いていない配置
 */
export async function loadHouseLayout(ownerKey: string): Promise<HouseLayout> {
  const raw = await AsyncStorage.getItem(storageKey(ownerKey));
  if (!raw) return DEFAULT_HOUSE_LAYOUT;
  try {
    return parseHouseLayout(JSON.parse(raw));
  } catch {
    return DEFAULT_HOUSE_LAYOUT;
  }
}

/**
 * 配置を保存する。
 * @param ownerKey - 利用者を区別するキー
 * @param layout - 保存する配置
 */
export async function saveHouseLayout(ownerKey: string, layout: HouseLayout): Promise<void> {
  await AsyncStorage.setItem(storageKey(ownerKey), JSON.stringify(layout));
}
