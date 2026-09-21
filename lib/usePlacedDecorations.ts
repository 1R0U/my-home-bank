import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deletePlacedDecoration,
  fetchPlacedDecorations,
  insertPlacedDecoration,
} from "./decorationService";
import { getHouseRoomCenters } from "./rpg-hub/mapObjects";
import { PLACED_ID_PREFIX, toPlacedDecorations } from "./rpg-hub/placedDecorations";
import { createStaleGuard } from "./staleGuard";
import { isUuid } from "./uuid";
import { useMapStore } from "../store/mapStore";
import { useCurrentUser, useDataAccess } from "../store";

/**
 * 置いた装飾をDBから読み込み、マップへ反映する（Issue #223 / #244）。
 *
 * 取得に失敗したり、行が壊れていたりしても**町は表示する**。
 * 装飾が出ないだけで、建物へ行けなくなるほうが困るため。
 *
 * **引くのは家族ぶん。** 家の中の装飾はその家の持ち主に紐づいており、
 * 誰の端末から入っても同じ内装になる必要がある（Issue #244）。
 * 庭（外）に置いたものも同じ取得に乗るので、家族どうしで見える。
 *
 * @returns 置く・しまう・取り直す関数と、自分が置いたものの情報
 */
export function usePlacedDecorations(): {
  /** 自分が置いたものの数。置ける数の上限はこれで数える */
  ownCount: number;
  /** 自分が置いたもののオブジェクトid。しまえるのはこれだけ */
  ownIds: ReadonlySet<string>;
  place: (decoration: {
    assetId: string;
    roomOwnerId: string | null;
    rotationY: number;
    scale: number;
    x: number;
    z: number;
  }) => Promise<void>;
  reload: () => Promise<void>;
  remove: (objectId: string) => Promise<void>;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setPlacedDecorations = useMapStore((state) => state.setPlacedDecorations);
  // 家（＝部屋）が決まらないと、家の中の装飾を置く場所が決まらない。
  // 家族が読み込まれ直したら、装飾も取り直す（下の effect の依存に入れてある）
  const familyHouses = useMapStore((state) => state.familyHouses);
  const guardRef = useRef(createStaleGuard());
  const [ownIds, setOwnIds] = useState<ReadonlySet<string>>(new Set());

  const userId = currentUser?.id;

  /**
   * 装飾を引く相手。**自分＋家（＝部屋）の持ち主**。
   *
   * 自分を必ず含めるのは、家がまだ読み込めていないときでも、自分が庭に置いたものは
   * 出したいため。実データを引けない（UUIDでない）idは、問い合わせが必ず失敗するので外す。
   */
  const fetchUserIds = useMemo(() => {
    const ids: string[] = [];
    if (isUuid(userId)) ids.push(userId);
    for (const house of familyHouses) {
      if (isUuid(house.familyMemberId) && !ids.includes(house.familyMemberId)) {
        ids.push(house.familyMemberId);
      }
    }
    return ids;
  }, [familyHouses, userId]);

  /**
   * 持ち主のid → 部屋の中心。家の中の装飾をワールド座標へ直すのに使う。
   * **並び順は家と同じにすること**（並びで部屋が決まる）。
   */
  const roomCenters = useMemo(
    () => getHouseRoomCenters(familyHouses.map((house) => house.familyMemberId ?? "")),
    [familyHouses],
  );

  // 書き込みの完了を待っているあいだに誰へ切り替わったかを見るための、いまの利用者。
  // 書き込み側のクロージャが持つ `userId` は呼び出し時点のもので、切替後も古いまま
  // （#222 で同じ形の競合を踏んでいる）。
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const reload = useCallback((): Promise<void> => {
    // **start() は入口で1回だけ。** .then の中で呼ぶと isCurrent が常に true になる（#147）
    const requestId = guardRef.current.start();

    if (!canUseRealData || !userId || fetchUserIds.length === 0) {
      if (guardRef.current.isCurrent(requestId)) {
        setPlacedDecorations([]);
        setOwnIds(new Set());
      }
      return Promise.resolve();
    }

    return fetchPlacedDecorations(fetchUserIds)
      .then((rows) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        const { errors, objects } = toPlacedDecorations(rows, roomCenters);
        // 壊れた行は捨てて残りを出す。捨てた理由は追えるように残す
        if (errors.length > 0) {
          console.warn("置いた装飾の一部を読み込めませんでした", errors);
        }
        setPlacedDecorations(objects);
        // しまえるのは自分が置いたものだけ（DB側も user_id で弾く）
        setOwnIds(
          new Set(
            rows
              .filter((row) => row.user_id === userId)
              .map((row) => `${PLACED_ID_PREFIX}${row.id}`),
          ),
        );
      })
      .catch((e: unknown) => {
        console.warn("置いた装飾の取得に失敗しました", e);
        if (!guardRef.current.isCurrent(requestId)) return;
        // 取れなかったときは何も置かれていない状態にする。
        // 前のユーザーの装飾が残るより、出ないほうがよい
        setPlacedDecorations([]);
        setOwnIds(new Set());
      });
  }, [canUseRealData, fetchUserIds, roomCenters, setPlacedDecorations, userId]);

  /**
   * 書き込んだあと、まだ同じ人なら読み直す。
   *
   * 待っているあいだに人が変わっていたら読み直さない。読み直すと `createStaleGuard` の
   * 「最後に始めた取得が最新」に乗ってしまい、切り替えた先の人の庭へ前の人の装飾が
   * 入る（#222 で踏んだのと同じ形）。
   * @param write - 実際の書き込み
   */
  const writeThenReload = useCallback(
    async (write: (id: string) => Promise<void>): Promise<void> => {
      if (!canUseRealData || !userId) return;
      const targetUserId = userId;
      await write(targetUserId);
      if (userIdRef.current !== targetUserId) return;
      await reload();
    },
    [canUseRealData, reload, userId],
  );

  /**
   * 装飾を1つ置く。
   *
   * 家の中に置くときは `roomOwnerId` にその家の持ち主を、座標には**部屋の中心からの
   * 相対値**を渡す（呼び出し側が `findHouseRoomOwnerId` で判断する）。
   * @param decoration - 置くもの
   */
  const place = useCallback(
    (decoration: {
      assetId: string;
      roomOwnerId: string | null;
      rotationY: number;
      scale: number;
      x: number;
      z: number;
    }) => writeThenReload((id) => insertPlacedDecoration(id, decoration)),
    [writeThenReload],
  );

  /**
   * 置いた装飾を1つしまう。
   * @param objectId - マップ上のオブジェクトid（`placed-` 付き）
   */
  const remove = useCallback(
    (objectId: string) =>
      writeThenReload((id) =>
        // マップ上のidは町の固定物とぶつからないよう接頭辞を足してあるので、外して渡す
        deletePlacedDecoration(id, objectId.slice(PLACED_ID_PREFIX.length)),
      ),
    [writeThenReload],
  );

  // **ユーザーが変わったら、取得を待たずに前の人の装飾を消す。**
  // 待つと、切り替え直後のあいだ前の人の庭が見えてしまう（#147 と同じ形）。
  // 同じユーザーのまま取り直すときは消さない。置いた直後の再取得で
  // 庭が一瞬空になるのを避けるため（#216 と同じ考え方）。
  useEffect(() => {
    setPlacedDecorations([]);
    setOwnIds(new Set());
  }, [setPlacedDecorations, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ownCount: ownIds.size, ownIds, place, reload, remove };
}
