import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHouseLayout, saveHouseLayout } from "./houseLayoutService";
import { loadHouseLayout } from "./houseLayoutStorage";
import { DEFAULT_HOUSE_LAYOUT, type HouseLayout } from "./rpg-hub/houseLayout";
import { useResource } from "./useResource";
import { useCurrentUser, useDataAccess } from "../store";

/**
 * 持ち主ごとの、保存の直列化チェーン（CodeRabbitレビュー指摘）。
 *
 * `useRef` はフック（コンポーネント）のインスタンスにつくため、保存の途中で
 * 画面を離れて戻ると、新しいインスタンスのチェーンは空から始まり、前のインスタンスの
 * 保存と順序を共有できない。モジュール直下（＝アプリの実行中ずっと残る）に持つことで、
 * 同じ持ち主への保存は、画面を出入りしても常に前の保存（reloadまで）の後に実行される。
 */
const saveChains = new Map<string, Promise<void>>();

/**
 * その持ち主への保存を、前の保存（reloadまで）が終わるまで待ってから実行する。
 * @param ownerId - 保存先の持ち主の `users.id`
 * @param run - 実行する保存（失敗したときの表示用警告まで含む）
 * @returns 今回の保存（前の保存を待った上で実行し終えたとき）が終わるPromise
 */
function chainSave(ownerId: string, run: () => Promise<void>): Promise<void> {
  const next = (saveChains.get(ownerId) ?? Promise.resolve())
    .catch(() => undefined) // 前の保存の失敗を、次の保存の失敗として扱わない
    .then(run);
  saveChains.set(ownerId, next);
  return next;
}

/**
 * 持ち主ごとの、直近の保存の連番（1R0Uさんレビュー指摘）。
 *
 * 保存は chainSave で順序が保たれるが、それぞれの保存のあとの `reload()` まで
 * 順番に実行すると、後で始めた保存の表示（楽観的更新）が、先に始めた保存の
 * reload（まだ古い配置のまま）で一時的に巻き戻って見える。続けて動かした
 * 家具が元の位置に戻って見えたり、巻き戻っている間に保存が失敗すると、
 * 保存できたと思い込んでしまう。
 *
 * 自分より後に保存が始まっていたら、自分の reload は行わない（表示は次の
 * 保存の reload に任せる）ことで、常に「いちばん新しい保存のあとの reload」
 * だけを表示に反映する。
 */
const latestSaveVersion = new Map<string, number>();

/** その持ち主の移行（端末→DB）の確認が済んでいるか（1R0Uさんレビュー指摘：
 * 確認済みでも再び開くたびに端末を読み直し、もようがえボタンが一瞬消えていた）。 */
const migrationChecked = new Set<string>();

/**
 * テスト専用。モジュール直下に持つ状態（アプリの実行中ずっと残る想定）を空にする。
 * テストファイルをまたいで前のテストの持ち主ID（同じUUIDを使うことが多い）の
 * 状態が残ると、移行済み・保存連番の判定がテストどうしで混ざってしまうため、
 * `beforeEach` から呼ぶ。
 */
export function __resetHouseLayoutModuleStateForTests(): void {
  saveChains.clear();
  latestSaveVersion.clear();
  migrationChecked.clear();
}

/**
 * 家の中の配置（もようがえ）を読み、変えたら保存する（Issue #244）。
 *
 * 元は端末の中だけに保存していた（Issue #425）が、他の家族の家の中を見られるように
 * するため、サーバー（`house_layouts`）へ移した。端末に残っていた配置は、まだDBに
 * 保存していない人だけ、初回に一度だけDBへ送って引き継ぐ（移行後は端末側を使わない）。
 *
 * **モックアカウント・未ログイン・開発用ロール指定（`isLive` が false）では、
 * もようがえできない。** 以前は端末内保存で誰でも動かせたが、他の家族から見える
 * ようにDB保存へ移したことで、書き込みが必ず失敗する状態になった。他の画面の
 * モックアカウント扱い（着せ替え等）と同じく、編集不可にそろえている
 * （1R0Uさんレビュー指摘への回答。意図した変更として `docs/domain-glossary.md` に記載）。
 *
 * @param viewedOwnerId - 他の家族の家を見るときの持ち主の `users.id`。省略すると自分の家
 * @returns `layout` は読み込みが終わるまで null。`updateLayout` は自分の家のときだけ渡る
 *   （他人の家を見ているときは undefined。見るだけで動かせない）。`error` は取得に
 *   失敗したときの文言、`reload` は再試行に使う
 */
export function useHouseLayout(viewedOwnerId?: string): {
  error: string | null;
  /** 自分の家かどうか（移行中でも変わらない。見出しなど「誰の家か」の表示に使う） */
  isOwn: boolean;
  layout: HouseLayout | null;
  reload: () => Promise<void>;
  updateLayout: ((next: HouseLayout) => void) | undefined;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const ownerId = viewedOwnerId ?? currentUser?.id;
  const isOwn = !viewedOwnerId || viewedOwnerId === currentUser?.id;
  // 移行を試すのは1回だけ（保存先の応答を待つ間に効果が重ねて走らないように）
  const migratingRef = useRef(false);
  // 移行に失敗している間は、もようがえさせない（CodeRabbitレビュー指摘：
  // 編集を許すと、まだ移行していない端末の配置を、DBへの最初の保存で
  // 永久に送れなくしてしまう）。
  //
  // 値を毎回新しいオブジェクトにして持つ（真偽値そのものを state にすると、
  // 「何も送らず確認済みにする」経路で false → false のように値が変わらず、
  // React が再描画をしない。migrationChecked（Setへの追加）は再描画無しでは
  // 描画に反映されないため、値が変わらなくても再描画が起きるようにしている）。
  const [migrationStatus, setMigrationStatus] = useState<{ failed: boolean }>({ failed: false });

  const { data, error, hasData, isLive, reload, updateData } = useResource({
    // 見ている人（本人）のIDも入れる（1R0Uさんレビュー指摘：AGENTS.md
    // 「取得結果を変えうる値は全部入れる」。RLSにより、同じownerIdでも
    // 見ている人によって取得できる・できないが変わる）
    key: canUseRealData && ownerId ? ["house-layout", currentUser?.id, ownerId] : null,
    fetcher: () => fetchHouseLayout(ownerId as string),
    initialData: null as HouseLayout | null,
    preview: DEFAULT_HOUSE_LAYOUT,
    errorMessage: "家の中の配置を読み込めませんでした",
  });

  // まだ移行の確認が済んでいない間は、効果（useEffect）が動く前の描画からもようがえを
  // させない（1R0Uさんレビュー指摘：useEffectは次の描画で走るため、確認が済むまでの
  // 1描画ぶんだけ updateLayout が渡ってしまう隙間があった）。
  const needsMigrationCheck =
    isOwn && isLive && hasData && data === null && !!ownerId && !migrationChecked.has(ownerId);

  // 自分の家で、DBにまだ行が無く、まだ確認していない持ち主だけ、端末に残っている配置を送る。
  // 通常の保存（updateLayout）と同じ chainSave を通す（CodeRabbitレビュー指摘：
  // 別の直列化だと、再マウントをまたいで移行と編集が競合したとき、後から終わった
  // 移行のupsertが新しい編集を古い端末の配置で上書きできてしまう）。
  useEffect(() => {
    if (!needsMigrationCheck || !ownerId || migratingRef.current) return;
    migratingRef.current = true;
    chainSave(ownerId, async () => {
      const legacy = await loadHouseLayout(ownerId);
      // 端末に何も残っていない（保存したことが無い）ときの既定値は、DB側の既定と同じなので送る価値が無い
      if (JSON.stringify(legacy) !== JSON.stringify(DEFAULT_HOUSE_LAYOUT)) {
        await saveHouseLayout(ownerId, legacy);
        await reload();
      }
      migrationChecked.add(ownerId);
      setMigrationStatus({ failed: false });
    }).catch((error: unknown) => {
      // 失敗したときは確認済みにしない（このまま表示している間はもようがえさせない）。
      // migratingRef だけ戻し、次に開いたとき（再マウント）にまた移行を試す。
      console.warn("家の中の配置を移行できませんでした", error);
      migratingRef.current = false;
      setMigrationStatus({ failed: true });
    });
  }, [needsMigrationCheck, ownerId, reload]);

  const updateLayout = useCallback(
    (next: HouseLayout) => {
      if (!ownerId) return;
      // 保存の応答を待たず、すぐに表示へ反映する（もようがえの操作感のため）
      updateData(() => next);
      const version = (latestSaveVersion.get(ownerId) ?? 0) + 1;
      latestSaveVersion.set(ownerId, version);
      chainSave(ownerId, () =>
        saveHouseLayout(ownerId, next)
          .then(() => {
            // 自分より新しい保存がまだ始まっていなければ、取得し直して表示を確定する。
            // 既に新しい保存が始まっているなら、その reload に表示を任せる
            // （1R0Uさんレビュー指摘：ここで無条件に reload すると、まだ古い配置のまま
            // サーバーから取得し直してしまい、後の保存の楽観的更新を巻き戻してしまう）
            if (latestSaveVersion.get(ownerId) === version) return reload();
          })
          .catch((error: unknown) => {
            console.warn("家の中の配置を保存できませんでした", error);
          }),
      );
    },
    [ownerId, reload, updateData],
  );

  const layout = !isLive ? data : hasData ? data ?? DEFAULT_HOUSE_LAYOUT : null;
  const canEdit = isOwn && isLive && !needsMigrationCheck && !migrationStatus.failed;
  return { error, isOwn, layout, reload, updateLayout: canEdit ? updateLayout : undefined };
}
