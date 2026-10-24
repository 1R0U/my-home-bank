// RPGハブに出てくるアセットの一覧（Issue #220）。
//
// **アセットを1つ増やすときに編集するのはこのファイルだけ。**
// 以前は次の5か所に分かれており、どれか1つを書き忘れると静かに壊れていた。
//
//   1. assets.ts      RPG_HUB_ASSETS へIDを足す
//   2. buildingParts  *_PARTS に形を定義する
//   3. buildingParts  PARTS_BY_ASSET へ登録する
//   4. assets.ts      影を落とさないものは NO_SHADOW_ASSETS にも足す
//   5. mapObjects     装飾なら DECORATION_SPECS に大きさを足す
//
// 実際 4 は書き忘れが起きうるとして、assets.ts に注意書きとテストが後から入っていた。
// 着せ替え品と装飾品はこれから継続的に増やすため、1エントリで済む形にしてある。
//
// 形（parts）は buildingParts.ts に置いたまま。あちらは「形」、ここは「対応づけ」。

import {
  BANK_PARTS,
  BED_PARTS,
  BOOKSHELF_PARTS,
  BULLETIN_BOARD_PARTS,
  BUSH_BERRY_PARTS,
  BUSH_PARTS,
  BUSH_TALL_PARTS,
  BUSH_WIDE_PARTS,
  CAP_PARTS,
  CHAIR_PARTS,
  CROWN_PARTS,
  EYEPATCH_PARTS,
  FALLBACK_PARTS,
  FENCE_PARTS,
  FLOOR_LAMP_PARTS,
  FLOWERBED_PARTS,
  GLASSES_PARTS,
  GRASS_FLOWER_PARTS,
  GRASS_PARTS,
  GRASS_TALL_PARTS,
  GRASS_WIDE_PARTS,
  HANGER_RACK_PARTS,
  HAT_PARTS,
  HISTORY_PARTS,
  HOUSE_PARTS,
  KNIT_HAT_PARTS,
  LAMP_PARTS,
  MUSTACHE_PARTS,
  PATH_PARTS,
  PLAYER_CAT_PARTS,
  PLAYER_DOG_PARTS,
  PLAYER_HAMSTER_PARTS,
  PLAYER_PANDA_PARTS,
  PLAYER_PARTS,
  POTTED_PLANT_PARTS,
  RABBIT_PARTS,
  ROCK_FLAT_PARTS,
  ROCK_PARTS,
  ROCK_PILE_PARTS,
  ROCK_TALL_PARTS,
  RUG_PARTS,
  SANTA_HAT_PARTS,
  SEASON_LEAVES_PARTS,
  SEASON_PETALS_PARTS,
  SEASON_SNOW_PARTS,
  STORE_PARTS,
  STRAW_HAT_PARTS,
  SUNGLASSES_PARTS,
  TABLE_PARTS,
  TASKS_PARTS,
  TEDDY_BEAR_PARTS,
  TOY_BOX_PARTS,
  TREE_PARTS,
  TREE_PINE_PARTS,
  TREE_TALL_PARTS,
  TREE_YOUNG_PARTS,
  VILLAGER_PARTS,
  type BuildingPart,
} from "./buildingParts.ts";
import { FLOORINGS, type HouseFinish, WALLPAPERS } from "./houseFinishes.ts";
import {
  createFlooringSampleParts,
  createHouseFloorParts,
  createHouseWallParts,
  createWallpaperSampleParts,
  type FlooringPattern,
  HOUSE_ENTRANCE_FLOOR_PARTS,
  HOUSE_FURNITURE_SHAPES,
  HOUSE_INVISIBLE_WALL_PARTS,
  HOUSE_MAT_PARTS,
  HOUSE_POST_PARTS,
  type WallpaperPattern,
} from "./houseInteriorParts.ts";
import type { AssetId, EquipmentSlot } from "../../types/map";

/**
 * アセットの種別。
 * `wallpaper` / `flooring` は自分の家の中の壁紙・床板（Issue #480）。置く物ではなく、壁・床の見た目を替える
 */
export type AssetCategory = "building" | "character" | "decoration" | "flooring" | "wallpaper" | "wearable";

/**
 * キャラクターの装着位置（Issue #221）。
 *
 * **座標を持つのはキャラクターの側だけ。** 着せ替え品は「どの枠に付くか」しか知らない。
 * こうしておくと、仮置きのカエルを本番のキャラクターへ差し替えるときに、
 * ここのアンカーを定義し直すだけで済み、アイテムは1つも触らなくてよい。
 *
 * `scale` はアイテム側の基準の大きさに対する倍率。アイテムはカエルに合わせた寸法で
 * 作ってあるので、頭の小さいキャラクターはここで縮める。
 */
/**
 * 着せ替え品を付ける点。基本は装着スロットと同じ名前で、スロットの中でも別の点に付くものの分だけ足す。
 *
 * - `mouth` … 口元。つけひげ（face 枠）が使う。目と口の位置関係はキャラクターごとに違う
 *   （カエルは目が頭の上、口が頭の前）ため、face のアンカーからずらして求められない（Issue #374）
 *
 * **装着スロット（何を同時に着けられるか）は増やしていない。** つけひげは今までどおり face 枠で、
 * めがねと同時には着けられない。
 */
export type AnchorPoint = EquipmentSlot | "mouth";

export type SlotAnchor = {
  position: { x: number; y: number; z: number };
  /** ラジアンでの回転。省略時は無回転 */
  rotation?: { x: number; y: number; z: number };
  /** 拡大率。省略時は 1 */
  scale?: number;
};

/**
 * 装飾として置くときの寸法。
 *
 * `size` は当たり判定の一辺で、**すべて正方形にする**。置いたものは向きを自由に変えられ、
 * 非正方形だと、向きによって塞ぐ側が変わってしまうため。
 * `isBlocked` は `rotationY` を反映するようになったが（#198）、回転後の4頂点を囲む四角なので
 * **斜めに回すと正方形でも最大√2倍に広がる**。判定を見た目より小さめにするのは、
 * その広がりぶんも含めて、葉や花のような外側まで塞ぐと歩きにくいため。
 *
 * `halfHeight` はローカル原点から底面までの距離。パーツ定義の底面と合わせる。
 *
 * 町ではマス（townGrid.ts、一辺0.9）ごとに置く（Issue #445）。`cells` は占めるマスの数（一辺）で、
 * 省略時は1マス。**見た目（パーツの広がり）も当たり判定（`size`）も `cells` マスぶんに収める。**
 * 拡大率1で1マスからはみ出す物（しげみ・岩・木）は 2×2 マスにしてある。
 * 占めるマスの数と拡大率の上限は townGrid.ts の `getDecorationCells` / `getDecorationMaxScale` が求める。
 */
export type DecorationPlacement = {
  /** 占めるマスの数（一辺）。省略時は 1 */
  cells?: number;
  halfHeight: number;
  /** 当たり判定を持つか。`false` は踏んで歩ける（草むら・道） */
  solid?: false;
  size: number;
};

/** アセット1つ分の定義。 */
export type AssetDefinition = {
  /**
   * 着せ替え品を付けられる位置。`character` だけが持つ。
   *
   * **使われている枠はすべて用意すること。** 用意が漏れた枠のアイテムは黙って付かない
   * （テストが検出する）。
   */
  anchors?: Partial<Record<AnchorPoint, SlotAnchor>>;
  /**
   * 付く点が枠のアンカーと違う着せ替え品だけが持つ（つけひげの `mouth`）。
   * 省略時は `slot` と同じ名前のアンカーに付く。
   */
  anchorPoint?: Exclude<AnchorPoint, EquipmentSlot>;
  category: AssetCategory;
  /**
   * 影を落とすか。省略時は落とす。
   *
   * 道のタイルは地面に貼りついた板なので、落とす側にすると自分の影で縞模様が出る。
   * 草むらは細すぎて影が点のノイズにしかならず、数のわりに影のパスを重くする。
   */
  castsShadow?: false;
  /**
   * 描かないか。当たり判定だけを持たせたい物（自分の家の中の、見えない壁）に付ける。
   * `parts` は持たせるが（形が無いとフォールバックの箱が出る決まりのため）、シーンは組み立てない
   */
  invisible?: true;
  /** 外部から来た値の検証に使う文字列。将来DBに保存されるのもこの値 */
  id: string;
  parts: BuildingPart[];
  /** 装飾として置くときの寸法。`decoration()` で置くものだけが持つ */
  placement?: DecorationPlacement;
  /**
   * ストアの棚に並べるときの形。省略時は `parts`。
   * 床板は部屋の床そのものが `parts` なので、棚に収めると薄い線にしか見えない。見本の形を別に持たせる
   */
  previewParts?: BuildingPart[];
  /**
   * 家の中の家具（ベッド・つくえなど。Issue #480）。置き方は他の装飾と同じで町にも置けるが、
   * ストアでは壁紙・床板と同じ「かぐ」の棚に並べる
   */
  furniture?: true;
  /** 家に付いている最初の壁紙・床板（Issue #480）。はじめから持っている扱いで、ストアに並べない */
  starter?: true;
  /**
   * 画面に出す名前。子供が読むので漢字を使わない。
   *
   * 画面側に表を作らずここへ置くのは、アイテムを増やすときに編集するのが
   * このファイルだけ、という前提を保つため。
   *
   * **装飾では「置かせるかどうか」も兼ねる。** 名前が無いものは選べない
   * （町の道のタイルのように、子供が並べる物ではないものを外すため）。
   */
  label?: string;
  /** 付く場所。`wearable` だけが持ち、**座標は持たない**（アンカーが決める） */
  slot?: EquipmentSlot;
};

/**
 * 基本の体（buildingParts.ts の `createBaseBodyParts`）と共通の目（`createBaseEyeParts`）で
 * 作ったキャラクターに共通のアンカー（Issue #332）。
 *
 * **新しいキャラクターも基本の体から作れば、このアンカーをそのまま使える。**
 * 着せ替え品をキャラクターごとに位置合わせし直さなくてよいようにするためのもの。
 *
 *   - head: 頭の箱（幅0.8・奥行き0.56、てっぺん y = 0.62、前後の中心 z = 0）の上面の中央。
 *     頭の幅・奥行きが着せ替え品の基準（以前のカエルの頭）と同じなので、帽子を縮めずに載せる。
 *     頭の上に立つ耳は、帽子のつばを突き抜けて見える
 *   - face: 共通の目（x = ±0.18、y = 0.42、前面 z = 0.3）。めがねのレンズ間隔（基準 ±0.25）を
 *     目の間隔に合わせて 0.72 倍にし、レンズの縁が目に重ならないよう目の前面から少し前に出す
 *   - mouth: 鼻（y = 0.34）のすぐ下、頭の正面（z = 0.3）。つけひげを face と同じ 0.72 倍で付ける。
 *     ほおぶくろ（リス、前面 z = 0.32）に埋もれないよう、正面から少し前に出す（Issue #374）
 */
const BASE_BODY_ANCHORS: Partial<Record<AnchorPoint, SlotAnchor>> = {
  face: { position: { x: 0, y: 0.42, z: 0.32 }, scale: 0.72 },
  head: { position: { x: 0, y: 0.62, z: 0 } },
  mouth: { position: { x: 0, y: 0.29, z: 0.31 }, scale: 0.72 },
};

/**
 * アセットの一覧。**増やすときはここへ1エントリ足すだけ。**
 *
 * 自然物（木・低木・岩・草むら）は1種類につき4つの形を用意してある。
 * 同じ形だけを並べると、散らしても模様のように見えてしまうため
 * （置くときは lib/rpg-hub/mapObjects.ts がランダムに選ぶ）。
 */
export const ASSET_CATALOG = {
  bank: { category: "building", id: "building-bank", parts: BANK_PARTS },
  // 町の広場の掲示板（Issue #354）。お知らせの一覧への入口
  board: { category: "building", id: "building-board", parts: BULLETIN_BOARD_PARTS },
  // 家具の装飾（Issue #480）。家の中にも町にも置ける
  bed: {
    category: "decoration",
    furniture: true,
    id: "decoration-bed",
    label: "ベッド",
    parts: BED_PARTS,
    placement: { cells: 2, halfHeight: 0.4, size: 1.4 },
  },
  bookshelf: {
    category: "decoration",
    furniture: true,
    id: "decoration-bookshelf",
    label: "ほんだな",
    parts: BOOKSHELF_PARTS,
    placement: { halfHeight: 0.75, size: 0.6 },
  },
  bush: {
    category: "decoration",
    id: "decoration-bush",
    label: "しげみ",
    parts: BUSH_PARTS,
    placement: { cells: 2, halfHeight: 0.4, size: 0.9 },
  },
  bushBerry: {
    category: "decoration",
    id: "decoration-bush-berry",
    label: "きのみのしげみ",
    parts: BUSH_BERRY_PARTS,
    placement: { cells: 2, halfHeight: 0.39, size: 0.9 },
  },
  bushTall: {
    category: "decoration",
    id: "decoration-bush-tall",
    label: "たてながのしげみ",
    parts: BUSH_TALL_PARTS,
    placement: { cells: 2, halfHeight: 0.4, size: 0.75 },
  },
  bushWide: {
    category: "decoration",
    id: "decoration-bush-wide",
    label: "よこながのしげみ",
    parts: BUSH_WIDE_PARTS,
    placement: { cells: 2, halfHeight: 0.3, size: 1.05 },
  },
  chair: {
    category: "decoration",
    furniture: true,
    id: "decoration-chair",
    label: "いす",
    parts: CHAIR_PARTS,
    placement: { halfHeight: 0.475, size: 0.5 },
  },
  // 町の境界の柵（Issue #194）。子供が選んで置く物ではないので label を持たせない（houseWall と同じ扱い）。
  // 歩ける範囲は movement.ts が境界で止めるので、柵そのものには当たり判定を持たせない。
  // 踏めるもの（solid: false）は影を落とさない決まりなので、細い柵も影は落とさない。
  fence: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-fence",
    parts: FENCE_PARTS,
    placement: { halfHeight: 0.45, size: 2, solid: false },
  },
  floorLamp: {
    category: "decoration",
    furniture: true,
    id: "decoration-floor-lamp",
    label: "スタンドライト",
    parts: FLOOR_LAMP_PARTS,
    placement: { halfHeight: 0.725, size: 0.35 },
  },
  flowerbed: {
    category: "decoration",
    id: "decoration-flowerbed",
    label: "かだん",
    parts: FLOWERBED_PARTS,
    placement: { cells: 2, halfHeight: 0.14, size: 1.7 },
  },
  grass: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-grass",
    label: "くさ",
    parts: GRASS_PARTS,
    placement: { halfHeight: 0.3, size: 0.7, solid: false },
  },
  grassFlower: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-grass-flower",
    label: "はなのくさ",
    parts: GRASS_FLOWER_PARTS,
    placement: { halfHeight: 0.26, size: 0.7, solid: false },
  },
  grassTall: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-grass-tall",
    label: "たかいくさ",
    parts: GRASS_TALL_PARTS,
    placement: { halfHeight: 0.28, size: 0.6, solid: false },
  },
  grassWide: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-grass-wide",
    label: "ひろいくさ",
    parts: GRASS_WIDE_PARTS,
    placement: { halfHeight: 0.22, size: 0.85, solid: false },
  },
  hangerRack: {
    category: "decoration",
    id: "decoration-hanger-rack",
    label: "ハンガーラック",
    parts: HANGER_RACK_PARTS,
    placement: { halfHeight: 0.65, size: 0.5 },
  },
  history: { category: "building", id: "building-history", parts: HISTORY_PARTS },
  house: { category: "building", id: "building-house", parts: HOUSE_PARTS },
  // --- 自分の家の中（Issue #444）。置く場所は lib/rpg-hub/houseInterior.ts ---
  // 子供が選んで置く物ではないので label を持たせない（path と同じ扱い）。
  // 家具の形は houseInteriorParts.ts。機能のある家具（そとへ・きがえ）は建物として扱う。
  // 形の原点は床の上（底面）なので halfHeight は 0。当たり判定は houseInterior.ts が家具ごとに持ち、
  // placement の size はほかの装飾と同じ決まり（正方形）に合わせただけ
  houseCloset: { category: "building", id: "building-house-closet", parts: HOUSE_FURNITURE_SHAPES.closet.parts },
  // 玄関の出口。床だけに見せるため描かない（当たり判定と名札「そとへ」だけを持つ）
  houseDoor: {
    category: "building",
    id: "building-house-door",
    invisible: true,
    parts: HOUSE_FURNITURE_SHAPES.door.parts,
  },
  houseEntranceFloor: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-house-entrance-floor",
    parts: HOUSE_ENTRANCE_FLOOR_PARTS,
    placement: { halfHeight: 0, size: 2, solid: false },
  },
  // 部屋の手前・右と玄関の左右に置く、見えない壁。シルバニアファミリーの家のように手前側を開けたまま、
  // 床の外へ歩いて出ないようにする。大きさは置く側（houseInterior.ts）が当たり判定で決める
  houseInvisibleWall: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-house-invisible-wall",
    invisible: true,
    parts: HOUSE_INVISIBLE_WALL_PARTS,
    placement: { halfHeight: 0, size: 0.3 },
  },
  houseMat: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-house-mat",
    parts: HOUSE_MAT_PARTS,
    placement: { halfHeight: 0, size: 1.5, solid: false },
  },
  housePlant: {
    category: "decoration",
    id: "decoration-house-plant",
    parts: HOUSE_FURNITURE_SHAPES.plant.parts,
    placement: { halfHeight: 0, size: 0.7 },
  },
  houseSofa: {
    category: "decoration",
    id: "decoration-house-sofa",
    parts: HOUSE_FURNITURE_SHAPES.sofa.parts,
    placement: { halfHeight: 0, size: 1.85 },
  },
  // 壁の切れ目（四隅）の柱。壁紙を替えても変わらない（Issue #480）
  housePost: {
    category: "decoration",
    id: "decoration-house-post",
    parts: HOUSE_POST_PARTS,
    placement: { halfHeight: 0, size: 0.3 },
  },
  // 壁に掛ける窓。床の上の家具と重ねて置くので、当たり判定は持たせない（影も落とさない）
  houseWindow: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-house-window",
    parts: HOUSE_FURNITURE_SHAPES.window.parts,
    placement: { halfHeight: 0, size: 1.8, solid: false },
  },
  lamp: {
    category: "decoration",
    id: "decoration-lamp",
    label: "ランプ",
    parts: LAMP_PARTS,
    placement: { halfHeight: 1, size: 0.4 },
  },
  // 道は歩く場所を示すもので、塞ぐためのものではない。当たり判定を持たせない。
  // size はタイルを隙間なく並べるときの間隔として mapObjects.ts の pathLine が読む。
  // **PATH_PARTS の板の一辺と同じ値にすること。** ずれると道に隙間や重なりが出る。
  path: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-path",
    parts: PATH_PARTS,
    // 1枚で 2×2 マス（townGrid.ts）
    placement: { cells: 2, halfHeight: 0.03, size: 1.8, solid: false },
  },
  pottedPlant: {
    category: "decoration",
    furniture: true,
    id: "decoration-potted-plant",
    label: "うえきばち",
    parts: POTTED_PLANT_PARTS,
    placement: { halfHeight: 0.5, size: 0.5 },
  },
  // 床に敷く布。踏んで歩けるので当たり判定を持たない（影も落とさない）
  rug: {
    castsShadow: false,
    category: "decoration",
    furniture: true,
    id: "decoration-rug",
    label: "ラグ",
    parts: RUG_PARTS,
    placement: { cells: 2, halfHeight: 0.05, size: 1.6, solid: false },
  },
  table: {
    category: "decoration",
    furniture: true,
    id: "decoration-table",
    label: "つくえ",
    parts: TABLE_PARTS,
    placement: { halfHeight: 0.4, size: 0.8 },
  },
  teddyBear: {
    category: "decoration",
    furniture: true,
    id: "decoration-teddy-bear",
    label: "ぬいぐるみ",
    parts: TEDDY_BEAR_PARTS,
    placement: { halfHeight: 0.3, size: 0.4 },
  },
  toyBox: {
    category: "decoration",
    furniture: true,
    id: "decoration-toy-box",
    label: "おもちゃばこ",
    parts: TOY_BOX_PARTS,
    placement: { halfHeight: 0.25, size: 0.7 },
  },
  // カエル。基本の体で作っているが、目だけ頭の上のふくらみに付けているので顔・頭のアンカーが違う。
  //   - face: ふくらみの正面の目（x = ±0.26、y = 0.70、前面 z = 0.3）。レンズ間隔（基準 ±0.25）を
  //     目の間隔に合わせて 1.04 倍にする
  //   - head: 頭の上面（y = 0.62）の後ろ寄り。帽子の山（半径0.22）がふくらみ（z = 0.12〜）に
  //     かからないよう、中心を z = -0.08 へ下げる。つばの前側はふくらみが突き抜けて見える
  //   - mouth: 頭を一周する口の帯（y = 0.32）のすぐ上、頭の正面（Issue #374）
  player: {
    anchors: {
      face: { position: { x: 0, y: 0.7, z: 0.32 }, scale: 1.04 },
      head: { position: { x: 0, y: 0.62, z: -0.08 } },
      mouth: { position: { x: 0, y: 0.39, z: 0.29 }, scale: 0.9 },
    },
    category: "character",
    id: "player-default",
    parts: PLAYER_PARTS,
  },
  // うさぎ。「キャラクターをえらぶ」の選べる姿の1つ（Issue #235 / #287）。
  playerRabbit: {
    anchors: BASE_BODY_ANCHORS,
    category: "character",
    id: "player-rabbit",
    parts: RABBIT_PARTS,
  },
  playerCat: {
    anchors: BASE_BODY_ANCHORS,
    category: "character",
    id: "player-cat",
    parts: PLAYER_CAT_PARTS,
  },
  // いぬ（Issue #446）。鼻先（マズル）が頭の正面より前へ出ているので、
  // 口元（mouth）だけは共通の値を使わず、鼻の下・鼻先の前面（z = 0.4）に合わせる。
  // 共通の値（z = 0.31）のままだと、つけひげが鼻先の中に埋もれて見えない
  playerDog: {
    anchors: {
      ...BASE_BODY_ANCHORS,
      mouth: { position: { x: 0, y: 0.22, z: 0.41 }, scale: 0.72 },
    },
    category: "character",
    id: "player-dog",
    parts: PLAYER_DOG_PARTS,
  },
  playerHamster: {
    anchors: BASE_BODY_ANCHORS,
    category: "character",
    id: "player-hamster",
    parts: PLAYER_HAMSTER_PARTS,
  },
  // パンダ（Issue #446）。目の位置は共通の目と同じなので、共通のアンカーを使う
  playerPanda: {
    anchors: BASE_BODY_ANCHORS,
    category: "character",
    id: "player-panda",
    parts: PLAYER_PANDA_PARTS,
  },
  rock: {
    category: "decoration",
    id: "decoration-rock",
    label: "いし",
    parts: ROCK_PARTS,
    placement: { cells: 2, halfHeight: 0.3, size: 0.9 },
  },
  rockFlat: {
    category: "decoration",
    id: "decoration-rock-flat",
    label: "ひらたいいし",
    parts: ROCK_FLAT_PARTS,
    placement: { cells: 2, halfHeight: 0.21, size: 1.1 },
  },
  rockPile: {
    category: "decoration",
    id: "decoration-rock-pile",
    label: "いしのやま",
    parts: ROCK_PILE_PARTS,
    placement: { cells: 2, halfHeight: 0.2, size: 0.85 },
  },
  rockTall: {
    category: "decoration",
    id: "decoration-rock-tall",
    label: "たかいいし",
    parts: ROCK_TALL_PARTS,
    placement: { cells: 2, halfHeight: 0.46, size: 0.6 },
  },
  // --- 季節の地面の飾り（Issue #282）。散らすのは lib/rpg-hub/seasonalDecorations.ts ---
  // 名前を持たせない。子供が並べる物ではなく、季節に合わせて勝手に出たり消えたりするため。
  // 踏んで歩けるよう当たり判定は持たせず、地面に貼りつく薄い物なので影も落とさない。
  seasonLeaves: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-season-leaves",
    parts: SEASON_LEAVES_PARTS,
    placement: { halfHeight: 0.0125, size: 0.9, solid: false },
  },
  seasonPetals: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-season-petals",
    parts: SEASON_PETALS_PARTS,
    placement: { halfHeight: 0.01, size: 0.9, solid: false },
  },
  // 雪だまりは半分ほど地面へ埋めて、上の丸みだけを見せる。
  // そのため halfHeight は形の半分の高さ（0.1）より小さくしてある。
  seasonSnow: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-season-snow",
    parts: SEASON_SNOW_PARTS,
    placement: { cells: 2, halfHeight: 0.03, size: 1.8, solid: false },
  },
  store: { category: "building", id: "building-store", parts: STORE_PARTS },
  tasks: { category: "building", id: "building-tasks", parts: TASKS_PARTS },
  tree: {
    category: "decoration",
    id: "decoration-tree",
    label: "き",
    parts: TREE_PARTS,
    placement: { cells: 2, halfHeight: 0.9, size: 0.6 },
  },
  treePine: {
    category: "decoration",
    id: "decoration-tree-pine",
    label: "とがったき",
    parts: TREE_PINE_PARTS,
    placement: { cells: 2, halfHeight: 0.9, size: 0.6 },
  },
  treeTall: {
    category: "decoration",
    id: "decoration-tree-tall",
    label: "たかいき",
    parts: TREE_TALL_PARTS,
    placement: { cells: 2, halfHeight: 0.9, size: 0.5 },
  },
  treeYoung: {
    category: "decoration",
    id: "decoration-tree-young",
    label: "わかぎ",
    parts: TREE_YOUNG_PARTS,
    placement: { cells: 2, halfHeight: 0.55, size: 0.45 },
  },
  // 住人のアンカー。カエルより頭が小さい（幅 0.42 対 0.8）ので scale で縮める。
  // **アイテム側は一切変えていない。** これがキャラクター差し替えの練習にもなっている。
  // face の 0.4 は、基準のレンズ間隔 ±0.25 を住人の目の位置 ±0.1 に合わせる倍率。
  // 髪の上面は y = 0.825（Issue #374 でここに合わせて下げた）。
  villager: {
    anchors: {
      face: { position: { x: 0, y: 0.63, z: 0.21 }, scale: 0.4 },
      head: { position: { x: 0, y: 0.82, z: 0 }, scale: 0.7 },
      mouth: { position: { x: 0, y: 0.52, z: 0.19 }, scale: 0.36 },
    },
    category: "character",
    id: "character-villager",
    parts: VILLAGER_PARTS,
  },
  // --- 着せ替え品（Issue #221）。付く場所は slot だけで、座標は持たない ---
  wearableGlasses: {
    category: "wearable",
    id: "wearable-glasses",
    label: "めがね",
    parts: GLASSES_PARTS,
    slot: "face",
  },
  wearableHat: {
    category: "wearable",
    id: "wearable-hat",
    label: "ぼうし",
    parts: HAT_PARTS,
    slot: "head",
  },
  wearableCap: {
    category: "wearable",
    id: "wearable-cap",
    label: "キャップ",
    parts: CAP_PARTS,
    slot: "head",
  },
  wearableCrown: {
    category: "wearable",
    id: "wearable-crown",
    label: "おうかん",
    parts: CROWN_PARTS,
    slot: "head",
  },
  wearableStrawHat: {
    category: "wearable",
    id: "wearable-straw-hat",
    label: "むぎわらぼうし",
    parts: STRAW_HAT_PARTS,
    slot: "head",
  },
  wearableSantaHat: {
    category: "wearable",
    id: "wearable-santa-hat",
    label: "サンタのぼうし",
    parts: SANTA_HAT_PARTS,
    slot: "head",
  },
  wearableKnitHat: {
    category: "wearable",
    id: "wearable-knit-hat",
    label: "ニットぼうし",
    parts: KNIT_HAT_PARTS,
    slot: "head",
  },
  wearableSunglasses: {
    category: "wearable",
    id: "wearable-sunglasses",
    label: "サングラス",
    parts: SUNGLASSES_PARTS,
    slot: "face",
  },
  wearableEyepatch: {
    category: "wearable",
    id: "wearable-eyepatch",
    label: "がんたい",
    parts: EYEPATCH_PARTS,
    slot: "face",
  },
  wearableMustache: {
    category: "wearable",
    id: "wearable-mustache",
    anchorPoint: "mouth",
    label: "つけひげ",
    parts: MUSTACHE_PARTS,
    slot: "face",
  },
} satisfies Record<string, AssetDefinition>;

/** カタログの見出し（`bank` / `treePine` など）。 */
export type AssetKey = keyof typeof ASSET_CATALOG;

/**
 * カタログの全エントリ。
 *
 * `ASSET_CATALOG` は `satisfies` で1件ずつの型を保っており、そのまま走査すると
 * `castsShadow` を持たないエントリで型が合わない。まとめて読むときはこちらを使う。
 */
export const ASSET_DEFINITIONS: readonly AssetDefinition[] = [
  ...Object.values(ASSET_CATALOG),
  ...createFinishDefinitions(),
];

/**
 * 壁紙・床板のエントリ（Issue #480）。
 *
 * **壁紙・床板を増やすときは houseFinishes.ts の一覧へ足す。** 色と柄だけが違い、形はどれも
 * 部屋の壁1枚・床なので、一覧から組み立てる。`ASSET_CATALOG` には入らないので、
 * `RPG_HUB_ASSETS` からは引けない（部屋の壁・床は houseFinishes.ts のIDで置く）。
 * @returns 壁紙・床板の定義
 */
function createFinishDefinitions(): AssetDefinition[] {
  const starter = (finish: HouseFinish<string>) => (finish.starter ? { starter: true as const } : {});
  return [
    ...WALLPAPERS.map((finish: HouseFinish<WallpaperPattern>) => ({
      category: "wallpaper" as const,
      id: finish.id,
      label: finish.label,
      parts: createHouseWallParts(finish.look),
      // 部屋の壁は装飾として置くので、ほかの装飾と同じ決まりで寸法を持たせる（当たり判定は houseInterior.ts が持つ）
      placement: { halfHeight: 0, size: 2 },
      previewParts: createWallpaperSampleParts(finish.look),
      ...starter(finish),
    })),
    // 床は地面に貼りつく板なので、道のタイルと同じく影は落とさない
    ...FLOORINGS.map((finish: HouseFinish<FlooringPattern>) => ({
      castsShadow: false as const,
      category: "flooring" as const,
      id: finish.id,
      label: finish.label,
      parts: createHouseFloorParts(finish.look),
      placement: { halfHeight: 0, size: 12, solid: false as const },
      previewParts: createFlooringSampleParts(finish.look),
      ...starter(finish),
    })),
  ];
}

/** IDから定義を引く表。 */
const DEFINITION_BY_ID = new Map<string, AssetDefinition>(
  ASSET_DEFINITIONS.map((definition) => [definition.id, definition]),
);

/**
 * アセットIDに対応する見た目のパーツ一覧を返す。
 * 未知のIDでも描画が消えないようフォールバックを返す。
 * @param assetId - 解決済みのアセットID
 * @returns パーツ一覧
 */
export function getBuildingParts(assetId: AssetId): BuildingPart[] {
  return DEFINITION_BY_ID.get(assetId)?.parts ?? FALLBACK_PARTS;
}

/**
 * ストアの棚に並べるときのパーツ一覧を返す（`previewParts` があればそちら）。
 * @param assetId - アセットID
 * @returns パーツ一覧
 */
export function getPreviewParts(assetId: AssetId): BuildingPart[] {
  const definition = DEFINITION_BY_ID.get(assetId);
  return definition?.previewParts ?? definition?.parts ?? FALLBACK_PARTS;
}

/**
 * 装飾を地面に接するように置くための y 座標を返す。
 *
 * **保存しないこと。** カタログの `halfHeight` と大きさから毎回決める。
 * 保存してしまうと、形を作り直したときに古い高さのまま宙に浮く。
 * -0.05 は地面（y = -0.08）へわずかに沈める分で、接地面の隙間を消す。
 * @param halfHeight - ローカル原点から底面までの距離
 * @param scale - 拡大率
 * @returns position.y に入れる値
 */
export function groundedY(halfHeight: number, scale: number): number {
  return halfHeight * scale - 0.05;
}

/**
 * アセットIDから、装飾として置くときの寸法を引く。
 * @param assetId - アセットID（外部から来た文字列でもよい）
 * @returns 寸法。装飾でない、または未知のIDなら null
 */
export function getDecorationPlacement(assetId: string): DecorationPlacement | null {
  return DEFINITION_BY_ID.get(assetId)?.placement ?? null;
}

/**
 * キャラクターの装着位置を引く。
 * @param assetId - キャラクターのアセットID
 * @param slot - 付ける点（装着する枠、または `mouth`）
 * @returns アンカー。キャラクターでない、またはその点を持たないなら null
 */
export function getSlotAnchor(assetId: string, slot: AnchorPoint): SlotAnchor | null {
  const definition = DEFINITION_BY_ID.get(assetId);
  if (!definition || definition.category !== "character") return null;
  return definition.anchors?.[slot] ?? null;
}

/**
 * 着せ替え品が付く点を引く。多くは枠と同じで、つけひげだけが口元（`mouth`）になる。
 * @param assetId - アセットID
 * @returns 付く点。着せ替え品でない、または未知のIDなら null
 */
export function getWearableAnchorPoint(assetId: string): AnchorPoint | null {
  const definition = DEFINITION_BY_ID.get(assetId);
  if (!definition || definition.category !== "wearable") return null;
  return definition.anchorPoint ?? definition.slot ?? null;
}

/**
 * その枠へ装備できる（着せ替え画面で選べる）枠を引く。
 * @param assetId - アセットID（外部から来た文字列でもよい）
 * @returns 付く枠。装備できない、または未知のIDなら null
 */
export function getWearableSlot(assetId: string): EquipmentSlot | null {
  const definition = DEFINITION_BY_ID.get(assetId);
  if (!definition || definition.category !== "wearable") return null;
  return definition.slot ?? null;
}

/**
 * アイテムの表示名を引く。
 * @param assetId - アセットID
 * @returns 表示名。名前を持たない、または未知のIDなら null
 */
export function getAssetLabel(assetId: string): string | null {
  return DEFINITION_BY_ID.get(assetId)?.label ?? null;
}

/**
 * 子供が庭に置ける装飾の一覧を、カタログの順で返す（Issue #224）。
 *
 * **名前を持つ装飾だけを返す。** 道のタイルのように、町を組み立てるためのもので
 * 子供が並べる物ではないアセットを外すため。
 * @returns 置ける装飾のアセットID
 */
export function getPlaceableDecorations(): AssetId[] {
  return ASSET_DEFINITIONS.filter(
    (definition) => definition.category === "decoration" && definition.label !== undefined,
  ).map((definition) => definition.id as AssetId);
}
