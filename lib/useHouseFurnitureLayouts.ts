import { useCallback, useEffect, useRef } from "react";
import { useCurrentUser, useDataAccess } from "../store";
import { useMapStore } from "../store/mapStore";
import { fetchHouseFurnitureLayouts, saveHouseFurnitureLayout, storeHouseFurniture } from "./houseFurnitureService";
import type { HouseFurnitureLayout } from "./rpg-hub/houseFurniture";
import { useResource } from "./useResource";

const EMPTY: HouseFurnitureLayout[] = [];

/**
 * 一覧のうち1つの家具の位置と向きを差し替えた一覧を返す（無ければ足す）。
 * しまったか（`stored`）は、渡した値が無ければ今の値のままにする（動かすだけでは変わらない）。
 * @param layouts - 今の一覧
 * @param layout - 差し替える家具
 * @returns 新しい一覧
 */
function upsertLayout(layouts: readonly HouseFurnitureLayout[], layout: HouseFurnitureLayout): HouseFurnitureLayout[] {
  const current = layouts.find((item) => item.furnitureId === layout.furnitureId);
  const stored = layout.stored ?? current?.stored ?? false;
  return [...layouts.filter((item) => item.furnitureId !== layout.furnitureId), { ...layout, stored }];
}

/**
 * 一覧のうち1つの家具を、しまったことにした一覧を返す（行が無ければ足す。位置は使わないので 0）。
 * @param layouts - 今の一覧
 * @param furnitureId - しまう家具
 * @returns 新しい一覧
 */
function storeLayout(layouts: readonly HouseFurnitureLayout[], furnitureId: string): HouseFurnitureLayout[] {
  const current = layouts.find((item) => item.furnitureId === furnitureId);
  return upsertLayout(layouts, { ...(current ?? { furnitureId, rotationY: 0, x: 0, z: 0 }), stored: true });
}

/**
 * 家の中の家具の位置と向きをDBから読み込み、マップへ反映する（Issue #477）。
 *
 * 取得に失敗しても**家は表示する**（家具が最初の位置に出るだけ）。
 * 実データを使わないとき（モックアカウント・未ログイン）は、動かした・しまった分を画面の中だけで覚える。
 * @returns 家具の位置と向きを保存する関数と、家具をしまう関数（Issue #506）
 */
export function useHouseFurnitureLayouts(): {
  save: (layout: HouseFurnitureLayout) => Promise<void>;
  store: (furnitureId: string) => Promise<void>;
} {
  const user = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setFurnitureLayouts = useMapStore((state) => state.setFurnitureLayouts);
  const userId = user?.id;
  const { data, hasData, isLive, reload, updateData } = useResource({
    key: canUseRealData && userId ? ["houseFurnitureLayouts", userId] : null,
    fetcher: () => fetchHouseFurnitureLayouts(userId as string),
    initialData: EMPTY,
    errorMessage: "家具の配置を取得できませんでした",
  });

  // 取得した（または利用者が変わって空になった）配置をマップへ反映する
  useEffect(() => {
    setFurnitureLayouts(data);
  }, [data, setFurnitureLayouts]);

  // 取得できているか。書き込みの結果を待つ間に変わるので、ref で最新を読む
  const hasDataRef = useRef(hasData);
  hasDataRef.current = hasData;

  /**
   * 画面の配置を書き換える。取得できていれば取得結果（キャッシュ）を書き換え、上の effect でマップへ反映する。
   * **取得できていない（失敗した）ときは、マップの配置を直接書き換える。** キャッシュは取得できるまで
   * 書き換えられないので、そのままだと3Dシーンだけが動いた位置に下ろし、アプリは元の位置のままになる。
   * すると次に持ち上げたとき、元の位置から動かしたことになり、元の場所へ飛んで戻って見えた（Issue #506 の実機確認）。
   * 取得できたら、取得結果（保存した位置を含む）で置き換わる。
   * @param updater - 今の配置から新しい配置を作る
   */
  const applyLocally = useCallback(
    (updater: (layouts: readonly HouseFurnitureLayout[]) => HouseFurnitureLayout[]) => {
      if (hasDataRef.current) updateData(updater);
      else setFurnitureLayouts(updater(useMapStore.getState().furnitureLayouts));
    },
    [setFurnitureLayouts, updateData],
  );

  /**
   * 書き込みに失敗したとき、DBから読み直して画面を保存されている状態へ戻す。
   * 読み直しても取得できなければ、書き込む前の配置へ戻す（取得結果が無いので、effect では戻らないため）。
   * @param before - 書き込む前のマップの配置
   */
  const restoreAfterFailure = useCallback(
    async (before: HouseFurnitureLayout[]) => {
      // 後ろに積まれた書き込みが終わってから読み直す（usePlacedDecorations の update と同じ。CodeRabbitレビュー指摘）
      await queueRef.current;
      await reload();
      if (!hasDataRef.current) setFurnitureLayouts(before);
    },
    // queueRef は ref なので依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reload, setFurnitureLayouts],
  );

  // 書き込みを順番に送るための列。「まわす」を続けて押すと書き込みが重なり、
  // 後から送った向きより先に前の向きが届くと、最後に押した向きと違う向きで保存されてしまう
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  /**
   * 家具の位置と向きを保存する。**保存を待たずに画面へ出し**、書き込みは押した順に1つずつ送る。
   * 失敗したときだけDBから読み直して、画面を保存されている状態へ戻す（usePlacedDecorations の update と同じ）。
   * @param layout - 位置と向き
   */
  const save = useCallback(
    (layout: HouseFurnitureLayout): Promise<void> => {
      if (!isLive || !userId) {
        // 実データを使わないときは、画面の中だけで動かす
        setFurnitureLayouts(upsertLayout(useMapStore.getState().furnitureLayouts, layout));
        return Promise.resolve();
      }
      const targetUserId = userId;
      const before = useMapStore.getState().furnitureLayouts;
      applyLocally((current) => upsertLayout(current, layout));
      const write = queueRef.current.then(() => saveHouseFurnitureLayout(targetUserId, layout));
      // 失敗しても次の書き込みは送れるよう、列には失敗を残さない
      queueRef.current = write.catch(() => undefined);
      return write.catch(async (e: unknown) => {
        await restoreAfterFailure(before);
        throw e;
      });
    },
    [applyLocally, isLive, restoreAfterFailure, setFurnitureLayouts, userId],
  );

  /**
   * 家具をしまう（Issue #506）。持ち物が増えるので、**保存できてから画面から消す**（先に消すと、
   * 失敗したときに「消えたのに持ち物に無い」が一瞬出る）。動かす書き込みと同じ列に積み、押した順に送る。
   * @param furnitureId - しまう家具のid
   */
  const store = useCallback(
    (furnitureId: string): Promise<void> => {
      if (!isLive || !userId) {
        // 実データを使わないときは、画面の中だけでしまう（持ち物は増えない）
        setFurnitureLayouts(storeLayout(useMapStore.getState().furnitureLayouts, furnitureId));
        return Promise.resolve();
      }
      const before = useMapStore.getState().furnitureLayouts;
      const write = queueRef.current.then(() => storeHouseFurniture(furnitureId));
      queueRef.current = write.catch(() => undefined);
      return write.then(
        () => applyLocally((current) => storeLayout(current, furnitureId)),
        async (e: unknown) => {
          await restoreAfterFailure(before);
          throw e;
        },
      );
    },
    [applyLocally, isLive, restoreAfterFailure, setFurnitureLayouts, userId],
  );

  return { save, store };
}
