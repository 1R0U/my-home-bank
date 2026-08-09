// HistoryChart の表示計算のうち、UIから切り離してテストできる部分を集約する

export function getBarHeight(value: number, maxValue: number, maxHeight: number): number {
  if (value === 0 || maxValue <= 0) {
    return 0;
  }
  return Math.max(2, (value / maxValue) * maxHeight);
}

export function clampPageIndex(index: number, pageCount: number): number {
  return Math.min(Math.max(index, 0), pageCount - 1);
}

export function getPageScrollOffset(pageIndex: number, pageWidth: number): number {
  return pageIndex * pageWidth;
}

export function getPageIndexFromScrollOffset(offsetX: number, pageWidth: number, pageCount: number): number {
  const index = Math.round(offsetX / pageWidth);
  return clampPageIndex(index, pageCount);
}

// 幅の変化(画面回転・分割画面など)でページ位置を再同期すべきスクロール位置を返す。
// 幅が未確定(0)のとき、またはユーザーが指でドラッグ中は再同期しない(nullを返す)。
export function getResyncScrollTarget(pageWidth: number, pageIndex: number, isDragging: boolean): number | null {
  if (pageWidth <= 0 || isDragging) {
    return null;
  }
  return getPageScrollOffset(pageIndex, pageWidth);
}
