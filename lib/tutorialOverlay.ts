export type TutorialRect = { x: number; y: number; width: number; height: number };
export type TutorialViewport = { width: number; height: number; top: number; bottom: number };

/** 画面外・未計測の対象を除き、強調範囲を画面内へ収める。 */
export function clipTutorialTarget(target: TutorialRect | null, width: number, height: number): TutorialRect | null {
  if (!target || !Object.values(target).every(Number.isFinite) || target.width <= 0 || target.height <= 0) return null;
  const x = Math.max(0, target.x);
  const y = Math.max(0, target.y);
  const right = Math.min(width, target.x + target.width);
  const bottom = Math.min(height, target.y + target.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/** 対象の上か下に説明を置く。対象がない場合や余白が足りない場合は中央へ置く。 */
export function getTutorialOverlayLayout(viewport: TutorialViewport, target: TutorialRect | null, panelHeight: number) {
  const { width, height } = viewport;
  const margin = 12;
  const top = viewport.top + margin;
  const bottom = height - viewport.bottom - margin;
  const panelWidth = Math.max(0, Math.min(380, width - margin * 2));
  let highlight = clipTutorialTarget(target, width, height);
  let maxHeight = Math.max(0, Math.min(height * 0.7, bottom - top));
  let panelTop = top + Math.max(0, (bottom - top - Math.min(panelHeight, maxHeight)) / 2);
  let panelLeft = (width - panelWidth) / 2;
  if (highlight) {
    const above = highlight.y - margin - top;
    const below = bottom - (highlight.y + highlight.height + margin);
    const useBelow = below >= Math.min(panelHeight, 240) || below >= above;
    const space = useBelow ? below : above;
    if (space >= 80) {
      maxHeight = Math.min(maxHeight, space);
      panelTop = useBelow ? highlight.y + highlight.height + margin : highlight.y - margin - Math.min(panelHeight, maxHeight);
      panelLeft = Math.max(margin, Math.min(width - panelWidth - margin, highlight.x + highlight.width / 2 - panelWidth / 2));
    } else {
      // 極端に小さい画面では、説明を読めることを優先して中央へ置く。
      highlight = null;
    }
  }
  const shades: TutorialRect[] = highlight ? [
    { x: 0, y: 0, width, height: highlight.y },
    { x: 0, y: highlight.y, width: highlight.x, height: highlight.height },
    { x: highlight.x + highlight.width, y: highlight.y, width: width - highlight.x - highlight.width, height: highlight.height },
    { x: 0, y: highlight.y + highlight.height, width, height: height - highlight.y - highlight.height },
  ] : [{ x: 0, y: 0, width, height }];
  return { highlight, shades, panel: { left: panelLeft, top: panelTop, width: panelWidth, maxHeight } };
}

type NavigationRoute = { name?: string; params?: { screen?: string; params?: NavigationRoute["params"] }; state?: { index?: number; routes: NavigationRoute[] } };

/** 戻る操作を許すのは、案内から明示した移動先へ向かうアクションだけ。 */
export function getTutorialNavigationPath(action: { payload?: NavigationRoute & { routes?: NavigationRoute[]; index?: number } }): string | null {
  let route: NavigationRoute = action?.payload;
  if (action?.payload?.routes) route = action.payload.routes[action.payload.index ?? action.payload.routes.length - 1];
  if (!route?.name) return null;
  let name = route.name;
  while (route.params?.screen) { name = route.params.screen; route = { name, params: route.params.params }; }
  while (route.state?.routes?.length) { route = route.state.routes[route.state.index ?? 0]; name = route.name; }
  return name && !name.startsWith("(") ? `/${name}` : null;
}
