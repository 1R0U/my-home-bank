import { MOCK_USERS } from "../constants/mockData";
import { useCurrentUser, useDataAccess } from "../store";
import { fetchFamilyUsers } from "./storeService";
import { useResource } from "./useResource";

export type FamilyMember = { id: string; name: string; role: "parent" | "child" };

const PREVIEW_MEMBERS: FamilyMember[] = MOCK_USERS.map(({ id, name, role }) => ({ id, name, role }));

/**
 * ログイン中の家庭の利用者（ID・名前・親か子供か）を取得するフック。
 * 依頼人名など、IDから名前を引くために使う。家事をしなくていい日の画面（Issue #396）では、
 * 子供だけを選ぶのにも使う。ログインしていなければモックの利用者を返す。
 * @param options.errorMessage - 取得に失敗したときに出す文言（画面ごとに言い換える）
 * @param options.requireRealData - true なら、実データを使える利用者（`canUseRealData`）のときだけ取得する。
 *   同じ画面の他のデータが `canUseRealData` で判定しているときに、判定をそろえるために使う
 *   （ログイン済みでも利用者IDがUUIDでないと、片方だけ実データになってしまう。PR #420 のレビュー）。
 *   省略時は従来どおり `isLoggedIn` で判定する
 */
export function useFamilyMembers(options: { errorMessage?: string; requireRealData?: boolean } = {}) {
  const { canUseRealData, isLoggedIn } = useDataAccess();
  const shouldFetch = options.requireRealData ? canUseRealData : isLoggedIn;
  const familyId = useCurrentUser()?.family_id;

  const { data, error, loading, reload } = useResource<FamilyMember[]>({
    errorMessage: options.errorMessage ?? "依頼人の情報を取得できませんでした",
    // 家族に未所属なら引ける相手がいないので、問い合わせずに空にする（従来どおりエラーにしない）
    fetcher: () => (familyId ? fetchFamilyUsers(familyId) : Promise.resolve([])),
    initialData: [],
    key: shouldFetch ? ["familyMembers", familyId ?? null] : null,
    preview: PREVIEW_MEMBERS,
  });

  return { error, loading, members: data, reload };
}
