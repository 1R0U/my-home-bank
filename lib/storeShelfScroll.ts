/**
 * 子供用ストア画面の3D棚（components/store/StoreShelfScene.tsx）の
 * 縦スクロールとタップ判定に使う純粋関数。
 * React Three Fiber の Canvas はテスト環境で実描画できないため、
 * ロジックはここに切り出してユニットテストする。
 */

/** タップ（商品選択）とスクロール操作を区別する移動量のしきい値（px）。 */
export const SCROLL_DRAG_THRESHOLD_PX = 6;

/**
 * スクロール可能な最大量（ワールド座標）。
 * 表示段数（visibleRows）を超えたぶんだけスクロールできる。
 */
export function getMaxScroll(rowCount: number, visibleRows: number, rowSpacing: number): number {
  return Math.max(0, (rowCount - visibleRows) * rowSpacing);
}

/**
 * この指の動きを「棚の縦スクロール」として扱うか。
 * スクロール可能で、横より縦の動きが大きく、しきい値以上動いたときだけ true。
 * （PanResponder の onMoveShouldSetPanResponder に使う）
 */
export function isVerticalScrollGesture(
  dx: number,
  dy: number,
  maxScroll: number,
  threshold: number = SCROLL_DRAG_THRESHOLD_PX,
): boolean {
  return maxScroll > 0 && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) >= threshold;
}

/**
 * ドラッグ量からスクロール位置を求める（0〜maxScroll にクランプ）。
 * 指を上に動かす（dy が負）と下の段が見える向きにスクロールする。
 */
export function getNextScroll(
  dragStartScroll: number,
  dy: number,
  dragToWorld: number,
  maxScroll: number,
): number {
  const next = dragStartScroll - dy * dragToWorld;
  return Math.min(Math.max(next, 0), maxScroll);
}

/**
 * 右端スクロールバーのつまみの高さ割合と、上端からの位置割合（いずれも 0〜1）。
 */
export function getScrollbarMetrics(
  scrollY: number,
  maxScroll: number,
  visibleRows: number,
  rowCount: number,
): { thumbFraction: number; thumbTopFraction: number } {
  const thumbFraction = Math.min(Math.max(visibleRows / Math.max(rowCount, 1), 0.2), 1);
  const progress = maxScroll > 0 ? scrollY / maxScroll : 0;
  return { thumbFraction, thumbTopFraction: progress * (1 - thumbFraction) };
}

/**
 * ポインタを押した位置と離した位置から、これが「タップ」かどうかを判定する。
 * 一定距離より小さい動きならタップ（商品選択）、それ以上ならドラッグ扱い。
 * どちらかの座標が不明なときはタップ扱い（座標が取れない環境でも従来どおり選択できる）。
 */
export function isTapWithinThreshold(
  start: { x: number; y: number } | null,
  end: { x: number; y: number } | null,
  maxMove: number = SCROLL_DRAG_THRESHOLD_PX,
): boolean {
  if (!start || !end) return true;
  return Math.hypot(end.x - start.x, end.y - start.y) < maxMove;
}
