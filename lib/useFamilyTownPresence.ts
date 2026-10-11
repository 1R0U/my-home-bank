import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assignFamilyPresenceColors } from "./rpg-hub/familyPresence.ts";
import {
  subscribeToFamilyTownPresence,
  type FamilyTownPosition,
  type FamilyTownPresenceSubscription,
} from "./familyPresenceService.ts";
import { useCurrentUser, useDataAccess } from "../store";
import { useFamilyMembers } from "./useFamilyMembers.ts";

export type FamilyTownMarker = FamilyTownPosition & { color: string; id: string };

/** 家族一覧の取得前・取得失敗時など、色が引けなかったときの既定色。 */
const FAMILY_PRESENCE_FALLBACK_COLOR = "#64748b";

/**
 * 同じ家族の「町」にいる人の現在位置を、マップの矢印アイコン用に返す（Issue #409）。
 *
 * 購読自体は画面にいる間ずっと保つ（町を出入りするたびに繋ぎ直すと、繋ぎ直しの間に
 * 届いた他の家族の更新を取りこぼす）。知らせる・やめるだけを `isInTown` で切り替える。
 * @param isInTown - 自分が今、町にいるか（家の中・2階では自分の位置を知らせない）
 * @param player - 自分の現在位置
 * @returns 自分以外の、町にいる家族の位置と色
 */
export function useFamilyTownPresence(
  isInTown: boolean,
  player: { facingY: number; x: number; z: number },
): readonly FamilyTownMarker[] {
  const { canUseRealData } = useDataAccess();
  const currentUser = useCurrentUser();
  const { members } = useFamilyMembers();
  const familyId = currentUser?.family_id;
  const userId = currentUser?.id;

  const [positions, setPositions] = useState<Record<string, FamilyTownPosition>>({});
  const subscriptionRef = useRef<FamilyTownPresenceSubscription | null>(null);

  // 最新の在圏・位置を、effectの再生成なしに参照できるようにする（接続直後に即反映するため）。
  const latestRef = useRef({ isInTown, player });
  latestRef.current = { isInTown, player };

  const syncPosition = useCallback(() => {
    const subscription = subscriptionRef.current;
    if (!subscription) return;
    const { isInTown: inTown, player: current } = latestRef.current;
    if (!inTown) {
      subscription.clearPosition();
      return;
    }
    subscription.setPosition({ facingY: current.facingY, x: current.x, z: current.z });
  }, []);

  useEffect(() => {
    if (!canUseRealData || !familyId || !userId) {
      setPositions({});
      return;
    }
    let cancelled = false;
    void subscribeToFamilyTownPresence(familyId, userId, (next) => {
      if (!cancelled) setPositions(next);
    }).then((subscription) => {
      if (cancelled) {
        subscription.stop();
        return;
      }
      subscriptionRef.current = subscription;
      syncPosition();
    });
    return () => {
      cancelled = true;
      subscriptionRef.current?.stop();
      subscriptionRef.current = null;
      setPositions({});
    };
  }, [canUseRealData, familyId, userId, syncPosition]);

  useEffect(() => {
    syncPosition();
  }, [isInTown, player.facingY, player.x, player.z, syncPosition]);

  const colorsByUserId = useMemo(
    () => assignFamilyPresenceColors(members.map((member) => member.id)),
    [members],
  );

  // 自分自身はsubscribeToFamilyTownPresenceのonChangeの時点で除かれているため、
  // ここでは絞り込まない。
  return useMemo(
    () =>
      Object.entries(positions).map(([id, position]) => ({
        color: colorsByUserId[id] ?? FAMILY_PRESENCE_FALLBACK_COLOR,
        id,
        ...position,
      })),
    [colorsByUserId, positions],
  );
}
