import { useMemo } from "react";
import { getMinimapBounds, isPathTile } from "../../lib/rpg-hub/minimap";
import { filterObjectsByLocation, type getHouseLocation } from "../../lib/rpg-hub/mapObjects";
import type { BuildingMapObject, MapObject, NpcMapObject } from "../../types/map";

type HouseLocation = ReturnType<typeof getHouseLocation>;

/**
 * 町のミニマップ（プレイヤー中心でスクロールする）の描き直しを間引く格子の大きさ
 * （ワールド座標）。この大きさ未満の移動では中心を動かさない（1R0Uさんレビュー指摘）。
 * 道タイル1枚（`PATH_TILE_WORLD_SIZE` ≒ 1.8）より少し広い程度で、見た目のズレが
 * 気にならない範囲にしている。
 */
const MINIMAP_TOWN_GRID = 2;

/**
 * RPGハブのマップ表示（Issue #314）に出すものと、表示する範囲を決める。
 * Issue #399 で RpgHubScreen から切り出した。
 * @param objects - 町の固定物 ＋ 置いた装飾
 * @param placedDecorations - 置いた装飾
 * @param houseLocation - いま居る区画（町／家の中／2階）
 * @param player - プレイヤーの位置
 */
export function useHubMinimap(
  objects: MapObject[],
  placedDecorations: MapObject[],
  houseLocation: HouseLocation,
  player: { x: number; z: number },
) {
  // マップ表示（Issue #314）。いま居る区画（町／家の中／2階）の建物・NPC・道だけを渡す。
  // 散らした自然物（木・岩など）は数が多くマップが見づらくなるため対象外にする。
  // 区画の判定は「かざる」の到達判定（handlePlace）と同じ filterObjectsByLocation を
  // 使う（1R0Uさんレビュー指摘：ここだけ getHouseLocation を呼び直して書き直すと、
  // 2か所の判定が食い違う原因になる）。
  const { zoneBuildings, zoneNpcs, zonePaths } = useMemo(() => {
    const buildings: BuildingMapObject[] = [];
    const npcs: NpcMapObject[] = [];
    const paths: MapObject[] = [];
    for (const object of filterObjectsByLocation(objects, houseLocation)) {
      if (object.type === "building") buildings.push(object);
      else if (object.type === "npc") npcs.push(object);
      else if (isPathTile(object)) paths.push(object);
    }
    return { zoneBuildings: buildings, zoneNpcs: npcs, zonePaths: paths };
  }, [houseLocation, objects]);
  const zoneDecorations = useMemo(
    () => filterObjectsByLocation(placedDecorations, houseLocation),
    [houseLocation, placedDecorations],
  );
  // 家の中・2階は範囲が固定なので、houseLocation だけに依存させる（1R0Uさんレビュー指摘：
  // 以前は player 全体（position イベントのたびに新しいオブジェクトに置き換わる）に
  // 依存しており、家の中にいても移動のたびに範囲を再計算し、参照も毎回変わっていた）。
  const houseMinimapBounds = useMemo(() => getMinimapBounds(houseLocation, { x: 0, z: 0 }), [houseLocation]);
  // 町はプレイヤーを中心にスクロールする固定幅の範囲。実座標のまま依存させると
  // position イベントのたびに参照が変わり、HubMapView の MapMarkersLayer（React.memo）が
  // 毎回描き直されてしまう（1R0Uさんレビュー指摘）。中心をタイル1枚分の格子に丸め、
  // 格子をまたぐまでは同じ参照を使い続けることで、見た目はほぼ変わらないまま描き直しを間引く。
  const roundedTownCenterKey = `${Math.round(player.x / MINIMAP_TOWN_GRID)}:${Math.round(player.z / MINIMAP_TOWN_GRID)}`;
  const townMinimapBounds = useMemo(
    () =>
      getMinimapBounds("town", {
        x: Math.round(player.x / MINIMAP_TOWN_GRID) * MINIMAP_TOWN_GRID,
        z: Math.round(player.z / MINIMAP_TOWN_GRID) * MINIMAP_TOWN_GRID,
      }),
    // player そのものではなく、丸めた格子の座標が変わったときだけ作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roundedTownCenterKey],
  );
  const minimapBounds = houseLocation === "town" ? townMinimapBounds : houseMinimapBounds;

  return { minimapBounds, zoneBuildings, zoneDecorations, zoneNpcs, zonePaths };
}
