import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_HOUSE_LAYOUT, parseHouseLayout, type HouseLayout } from "./rpg-hub/houseLayout";

/**
 * 家の中の配置（もようがえ）を、端末の中から読む（Issue #425 → #244）。
 *
 * もとは端末の中だけに保存していたが、他の家族の家の中を見られるようにDB
 * （`lib/houseLayoutService.ts`）へ移した。この読み取りは、まだDBに移していない人の
 * 配置を一度だけ引き継ぐため（`lib/useHouseLayout.ts`）だけに残す。新しい保存先は
 * DBのため、ここでの書き込み（保存）はもう行わない。
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
