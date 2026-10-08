import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { fetchEquippedItems, fetchOwnedItems, saveEquippedItem } from "./wardrobeService";
import { toEquipment, toOwnedWearables, type EquipmentChange } from "./rpg-hub/wardrobe";
import { DEFAULT_PLAYER_EQUIPMENT } from "./rpg-hub/equipment";
import { createStaleGuard } from "./staleGuard";
import { useWardrobeStore } from "../store/wardrobeStore";
import { useCurrentUser, useDataAccess } from "../store";

/**
 * 所有と装備をDBから読み込み、着せ替えの状態へ反映する（Issue #222）。
 *
 * 取得に失敗しても**町とキャラクターは表示する**。着せ替えが出ないだけで、
 * 遊べなくなるほうが困るため（#223 と同じ考え方）。
 *
 * **モックアカウント（`canUseRealData` が false）では既定の装備を着せる。**
 * 書き込みができないので着替えられないが、何も着ていないカエルが出るより、
 * 他の画面がモック値に戻るのと同じ見え方にそろえたほうが分かりやすい。
 *
 * @returns 読み込み済みか（Issue #306）、取り直す関数、着け替えをまとめて保存する関数（Issue #344）
 */
export function useWardrobe(): {
  isReady: boolean;
  reload: () => Promise<void>;
  saveEquipment: (changes: readonly EquipmentChange[]) => Promise<void>;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setWardrobe = useWardrobeStore((state) => state.setWardrobe);
  const loadedFor = useWardrobeStore((state) => state.equipmentLoadedFor);
  const guardRef = useRef(createStaleGuard());

  const userId = currentUser?.id;
  // 実データを読まない（未ログイン・モック）ときは null を対象にする
  // （useCharacterAppearance と同じ考え方。Issue #306）
  const targetLoadedFor = canUseRealData && userId ? userId : null;
  const isReady = loadedFor === targetLoadedFor;

  // 保存の完了を待っているあいだに誰へ切り替わったかを見るための、いまの利用者。
  // `saveEquipment` のクロージャが持つ `userId` は呼び出し時点のもので、切替後も古いまま。
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const reload = useCallback((): Promise<void> => {
    // **start() は入口で1回だけ。** .then の中で呼ぶと isCurrent が常に true になる（#147）
    const requestId = guardRef.current.start();

    if (!canUseRealData || !userId) {
      // 持ちものは空にする。買えないし脱げないので、選ばせる意味がない
      if (guardRef.current.isCurrent(requestId)) setWardrobe([], DEFAULT_PLAYER_EQUIPMENT, null);
      return Promise.resolve();
    }

    return Promise.all([fetchOwnedItems(userId), fetchEquippedItems(userId)])
      .then((results) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        const owned = toOwnedWearables(results[0]);
        const equipped = toEquipment(results[1], owned.assetIds);
        // カタログから消えたIDなどは捨てて残りを出す。捨てた理由は追えるように残す
        const errors = [...owned.errors, ...equipped.errors];
        if (errors.length > 0) {
          console.warn("着せ替えの一部を読み込めませんでした", errors);
        }
        setWardrobe(owned.assetIds, equipped.equipment, userId);
      })
      .catch((e: unknown) => {
        console.warn("着せ替えの取得に失敗しました", e);
        if (!guardRef.current.isCurrent(requestId)) return;
        // 取れなかったときは何も着ていない状態にする。
        // 前のユーザーの装備が残るより、出ないほうがよい
        setWardrobe([], {}, userId);
      });
  }, [canUseRealData, setWardrobe, userId]);

  /**
   * 更衣室で確定した着け替えをまとめて保存し、最後に1回だけ読み直す（Issue #344）。
   *
   * 先に画面を書き換えないのは、DB側が拒否したとき（持っていないものなど）に
   * 画面とDBがずれたままになるため。着せ替えは待たされても困らない。
   *
   * 枠ごとに1行なので、1枠ずつ順に保存する。**途中の枠で失敗しても読み直してから
   * 例外を投げる。** 保存できた枠と保存できなかった枠が混ざるので、DBの今の状態を
   * 画面に出しておかないと、何が保存されたのか分からなくなる。
   * @param changes - 変わった枠と、その枠に着けるもの（`getEquipmentChanges` の結果）
   */
  const saveEquipment = useCallback(
    async (changes: readonly EquipmentChange[]): Promise<void> => {
      if (!canUseRealData || !userId || changes.length === 0) return;
      const targetUserId = userId;
      try {
        for (const change of changes) {
          await saveEquippedItem(targetUserId, change.slot, change.assetId);
        }
      } finally {
        // **保存中に人が変わっていたら読み直さない。**
        // `createStaleGuard` は「古いレスポンス」を無視するだけで、**あとから始まった
        // 取得は必ず最新になる**。ここで古い `reload` を走らせると、切り替えた先の人の
        // 画面に前の人の装備が入る（#147 と同じ形）。
        if (userIdRef.current === targetUserId) await reload();
      }
    },
    [canUseRealData, reload, userId],
  );

  // **ユーザーが変わったら、取得を待たずに前の人の装備を消す。**
  // 待つと、切り替え直後のあいだ前の人の帽子が見えてしまう（#147 と同じ形）。
  // 同じユーザーのまま取り直すときは消さない。着け替え直後の再取得で
  // 一瞬裸になるのを避けるため（#216 と同じ考え方）。
  //
  // **すでに今の人の装備が入っているなら消さない（Issue #306）。** この effect は
  // マウントのたびにも走る。ホーム画面・設定画面のアイコンもこのフックを使うため、
  // 無条件に消すと、別の画面を開いただけで開いたままの町のキャラクターが一瞬裸になる。
  //
  // **切り替えた時点で、前の人の取得を無効にする（PR #313 レビュー対応）。**
  // 無効にするのが下の reload の開始（ふつうの effect）だけだと、画面が切り替わってから
  // その effect が走るまでの間に前の人の取得が終わり、前の人の装備が書き込まれうる。
  // レイアウト effect は画面の確定と同じ流れで走るので、その間に割り込まれない。
  useLayoutEffect(() => {
    guardRef.current.start();
    if (useWardrobeStore.getState().equipmentLoadedFor === targetLoadedFor) return;
    setWardrobe([], {});
    // targetLoadedFor は userId と canUseRealData から決まる値で、userId が変わったときに
    // 見直せば足りる（canUseRealData だけが変わった場合は reload が読み直す）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setWardrobe, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { isReady, reload, saveEquipment };
}
