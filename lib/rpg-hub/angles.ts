// 向き（ラジアン）の扱いをまとめる。プレイヤーとNPCの両方から使う。
//
// どちらも「今の向きから目標の向きへ、1フレームぶんだけ近いほうへ回す」という
// 同じ計算をするため、ここに1つだけ置いている。**急に向きが変わると、
// ぶつかった瞬間に体が飛ぶように見える**ので、回す量は必ず上限で区切る。

/**
 * 角度を -π 〜 π に収める。
 * 近いほうへ回すには、差を毎回この範囲へ畳み直す必要がある
 * （例: 179度 と -179度 の差は 358度 ではなく -2度）。
 * @param angle - ラジアン
 * @returns -π 〜 π に収めた角度
 */
export function normalizeAngle(angle: number): number {
  const wrapped = (angle + Math.PI) % (Math.PI * 2);
  return (wrapped < 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
}

/**
 * 今の向きから目標の向きへ、`maxTurn` を上限に近いほうへ回す。
 * @param current - 今の向き（ラジアン）
 * @param target - 目標の向き（ラジアン）
 * @param maxTurn - このフレームで回してよい量（ラジアン、0以上）
 * @returns 回したあとの向き。届く場合は目標そのもの
 */
export function turnToward(current: number, target: number, maxTurn: number): number {
  const diff = normalizeAngle(target - current);
  if (Math.abs(diff) <= maxTurn) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(diff) * maxTurn);
}
