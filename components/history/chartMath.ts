/**
 * HistoryChart の表示計算のうち、UIから切り離してテストできる部分を集約する。
 */

/**
 * チャートのバーの高さを計算する（最低2pxは確保）。
 * @param value - 表示する値
 * @param maxValue - 最大値（スケールの基準）
 * @param maxHeight - バーの最大高さ（px）
 * @returns 計算されたバーの高さ（px）
 */
export function getBarHeight(value: number, maxValue: number, maxHeight: number): number {
  if (value === 0 || maxValue <= 0) {
    return 0;
  }
  return Math.max(2, (value / maxValue) * maxHeight);
}

/**
 * ページインデックスを有効な範囲内にクランプする。
 * @param index - クランプするページインデックス
 * @param pageCount - ページ総数
 * @returns 0 〜 pageCount - 1 の範囲内に収めたインデックス
 */
export function clampPageIndex(index: number, pageCount: number): number {
  return Math.min(Math.max(index, 0), pageCount - 1);
}

/**
 * ページインデックスからスクロール位置を計算する。
 * @param pageIndex - ページインデックス
 * @param pageWidth - 1ページの幅（px）
 * @returns スクロール位置（px）
 */
export function getPageScrollOffset(pageIndex: number, pageWidth: number): number {
  return pageIndex * pageWidth;
}

/**
 * スクロール位置から最も近いページインデックスを計算する。
 * @param offsetX - 現在のスクロール位置（px）
 * @param pageWidth - 1ページの幅（px）
 * @param pageCount - ページ総数
 * @returns 最も近いページインデックス（範囲内にクランプ済み）
 */
export function getPageIndexFromScrollOffset(offsetX: number, pageWidth: number, pageCount: number): number {
  const index = Math.round(offsetX / pageWidth);
  return clampPageIndex(index, pageCount);
}

/**
 * 幅の変化（画面回転・分割画面など）でページ位置を再同期すべきスクロール位置を返す。
 * 幅が未確定（0）のとき、またはユーザーが指でドラッグ中は再同期しない（nullを返す）。
 * @param pageWidth - 1ページの幅（px）
 * @param pageIndex - 現在のページインデックス
 * @param isDragging - ドラッグ中かどうか
 * @returns 再同期すべきスクロール位置（px）。再同期不要な場合は null
 */
export function getResyncScrollTarget(pageWidth: number, pageIndex: number, isDragging: boolean): number | null {
  if (pageWidth <= 0 || isDragging) {
    return null;
  }
  return getPageScrollOffset(pageIndex, pageWidth);
}
