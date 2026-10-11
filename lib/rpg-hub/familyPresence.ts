/**
 * 家族それぞれの矢印アイコンの色（Issue #409）。だれが誰か分かるように、はっきり
 * 区別できる固定の配色を用意する。人数がこれを超えたら、配色を繰り越す（循環する）。
 */
export const FAMILY_PRESENCE_COLORS: readonly string[] = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#eab308", // yellow
  "#22c55e", // green
  "#a855f7", // purple
  "#f97316", // orange
];

/**
 * 家族のユーザーIDへ、安定した色を割り当てる（Issue #409）。
 *
 * 並び順を id の昇順に固定することで、取得順（DBの返す順）が変わっても
 * 同じメンバーには毎回同じ色が付く。
 * @param memberIds - 家族のユーザーID一覧（自分を含む）
 * @returns ユーザーIDごとの色
 */
export function assignFamilyPresenceColors(memberIds: readonly string[]): Record<string, string> {
  const sorted = [...memberIds].sort();
  const colors: Record<string, string> = {};
  sorted.forEach((id, index) => {
    colors[id] = FAMILY_PRESENCE_COLORS[index % FAMILY_PRESENCE_COLORS.length];
  });
  return colors;
}
