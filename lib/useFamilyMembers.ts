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
 */
export function useFamilyMembers(options: { errorMessage?: string } = {}) {
  const { isLoggedIn } = useDataAccess();
  const familyId = useCurrentUser()?.family_id;

  const { data, error, loading, reload } = useResource<FamilyMember[]>({
    errorMessage: options.errorMessage ?? "依頼人の情報を取得できませんでした",
    // 家族に未所属なら引ける相手がいないので、問い合わせずに空にする（従来どおりエラーにしない）
    fetcher: () => (familyId ? fetchFamilyUsers(familyId) : Promise.resolve([])),
    initialData: [],
    key: isLoggedIn ? ["familyMembers", familyId ?? null] : null,
    preview: PREVIEW_MEMBERS,
  });

  return { error, loading, members: data, reload };
}
