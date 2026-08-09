// HistoryChart の表示計算のうち、UIから切り離してテストできる部分を集約する

export function getBarHeight(value: number, maxValue: number, maxHeight: number): number {
  if (value === 0) {
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
