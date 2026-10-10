import { MOCK_USERS } from "../constants/mockData";
import { useCurrentUser, useDataAccess } from "../store";
import { fetchFamilyUsers } from "./storeService";
import { useResource } from "./useResource";

export type FamilyMember = { id: string; name: string };

const PREVIEW_MEMBERS: FamilyMember[] = MOCK_USERS.map(({ id, name }) => ({ id, name }));

/**
 * ログイン中の家庭の利用者（IDと名前）を取得するフック。
 * 依頼人名など、IDから名前を引くために使う。ログインしていなければモックの利用者を返す。
 */
export function useFamilyMembers() {
  const { isLoggedIn } = useDataAccess();
  const familyId = useCurrentUser()?.family_id;

  const { data, error, reload } = useResource<FamilyMember[]>({
    errorMessage: "依頼人の情報を取得できませんでした",
    // 家族に未所属なら引ける相手がいないので、問い合わせずに空にする（従来どおりエラーにしない）
    fetcher: () => (familyId ? fetchFamilyUsers(familyId) : Promise.resolve([])),
    initialData: [],
    key: isLoggedIn ? ["familyMembers", familyId ?? null] : null,
    preview: PREVIEW_MEMBERS,
  });

  return { error, members: data, reload };
}
