import type { Href } from "expo-router";

declare const assetIdBrand: unique symbol;

export type AssetId = string & { readonly [assetIdBrand]: true };
export type MapRouteId = "bank" | "history" | "house" | "store-child" | "tasks-child" | "wardrobe";

/**
 * オブジェクトごとに差し替えられる色の枠。
 *
 * 形（buildingParts.ts のパーツ）は共通のまま、色だけを1体ずつ変えるための仕組み。
 * NPCを家族の人数ぶん置くとき、1人につき1つアセットを増やすのを避けるために入れた。
 */
export type PaletteSlot = "accent" | "hair" | "skin";

/**
 * 着せ替え品を付けられる場所（Issue #221）。
 *
 * **位置の情報はキャラクター側が持つ。** アイテムが持つのはこの枠の名前だけで、座標は
 * キャラクターのアンカー（lib/rpg-hub/catalog.ts の `anchors`）が決める。
 * こうしておくと、キャラクターを差し替えてもアイテムを作り直さずに済む。
 *
 * `body` だけは他の枠と性質が違う。頭や顔に「載せる」のではなく、キャラクターの土台
 * そのものを入れ替える枠（Issue #235）。そのため `resolveEquipment` の
 * アンカー付け（catalog.ts の `anchors`）の対象にはならず、`webview/rpg-hub/scene.ts` が
 * 別扱いでプレイヤーの土台メッシュを作り直す。
 */
export type EquipmentSlot = "back" | "body" | "face" | "head";

/**
 * 装着スロットの一覧。**増やすときはここと `EquipmentSlot` だけ。**
 *
 * 並び順がそのまま組み立て順になる。順番を決めておくと、生成されるメッシュ名が
 * 実行ごとに入れ替わらない。検証（`parseMapObject`）もこの一覧を見る。
 */
export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ["body", "back", "face", "head"];

/**
 * 着せ替え画面に出す枠の名前。
 *
 * `Record` にしてあるので、`EquipmentSlot` を増やすとここも埋めるまで型が通らない。
 * 子供が読むので、漢字を使わない。
 */
export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  back: "せなか",
  body: "どうぶつ",
  face: "かお",
  head: "あたま",
};
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Vector3 = { x: number; y: number; z: number };

type MapObjectBase = {
  collidable: boolean;
  /**
   * 衝突判定に使う大きさ（見た目の大きさとは別に持つ）。
   * 木のように上へ広がるものは、幹に合わせて見た目より小さくしたほうが歩きやすい。
   * `collidable: true` のオブジェクトはこれを必ず持つ（持たないものは判定対象にならない）。
   */
  collisionSize?: { depth: number; width: number };
  id: string;
  model: AssetId;
  /**
   * パーツの色を枠ごとに上書きする。指定がない枠はパーツ側の色をそのまま使う。
   * 現在はNPCの見た目を1体ずつ変えるために使っている。
   */
  palette?: Partial<Record<PaletteSlot, string>>;
  /**
   * 身に着けている着せ替え品。枠ごとにアセットIDを1つ持つ。
   *
   * キャラクター（プレイヤー・NPC）だけが使う。プレイヤー専用にしないのは、家族一人ひとりの
   * キャラクターを立たせる構想（`NpcMapObject.familyMemberId`）があり、住人にも
   * 着せたくなるため。付く位置はキャラクター側のアンカーが決める。
   */
  equipment?: Partial<Record<EquipmentSlot, AssetId>>;
  position: Vector3;
  rotationY?: number;
  scale?: number;
};

export type BuildingMapObject = MapObjectBase & {
  /** 建物は必ず衝突する大きさを持つ。 */
  collisionSize: { depth: number; width: number };
  /** 建物正面（見た目上の扉の位置）を示す position からのオフセット。接近判定の基準点として使う */
  entranceOffset: Vector3;
  interactionRadius: number;
  interactive: true;
  route: MapRouteId;
  type: "building";
};

export type DecorationMapObject = MapObjectBase & {
  interactive: false;
  type: "decoration";
};

export type NpcMapObject = MapObjectBase & {
  /** 会話データ（lib/rpg-hub/dialogues.ts）を引くためのID */
  dialogueId: string;
  /**
   * このNPCが表す家族の `users.id`。
   *
   * ゆくゆくは家族一人ひとりのキャラクターを立たせたいので、その紐づけ先として持つ。
   * **まだ Supabase とはつないでいない**（今いるNPCは町の住人で、この値を持たない）。
   * つなぐときは、この値を使って会話内容をその人の状況から組み立てる。
   */
  familyMemberId?: string;
  interactionRadius: number;
  interactive: true;
  /** 画面に出す呼び名。「〇〇とはなす」のように使う */
  name: string;
  type: "npc";
};

export type MapObject = BuildingMapObject | DecorationMapObject | NpcMapObject;

export const MAP_ROUTES: Record<MapRouteId, Href> = {
  bank: "/bank",
  history: "/history",
  // 家の中は画面遷移ではなくテレポートで入る（ChildHomeScreen.tsx）。
  // この値は Record<MapRouteId, Href> を満たすためだけの未使用のフォールバックで、
  // 開発用の2D比較画面（ChildHomeScreen2D.tsx）がタップされたときにだけ実際に使われる。
  house: "/main-child",
  "store-child": "/store-child",
  "tasks-child": "/tasks-child",
  wardrobe: "/wardrobe",
};
