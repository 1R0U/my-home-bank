declare const assetIdBrand: unique symbol;

export type AssetId = string & { readonly [assetIdBrand]: true };

/**
 * 建物が指す行き先の種類。
 *
 * **画面のパスではなく「何の建物か」を表す**（Issue #247）。大人・子供のどちらも
 * 同じ町へ入るため、`tasks-child` のようにロールを含む名前にすると、大人が入ったときに
 * 意味がねじれる。実際にどの画面へ行くかは `resolveMapRoute`（`lib/rpg-hub/routes.ts`）が
 * 入っている人のロールから決める。
 *
 * `house`（町の自分の家）/ `exit`（家の中の玄関）は
 * 画面遷移ではなくテレポートで処理する（`RpgHubScreen.tsx`、Issue #444）ため、`resolveMapRoute` の
 * 表には載っているが実際には使われないフォールバック値を返す。`wardrobe`（家の中のクローゼット）は
 * テレポートではなく、実際に `/wardrobe` へ画面遷移する。
 *
 * `board`（町の広場の掲示板）は、自分あてのお知らせの一覧（大人は `/notifications-adult`、子供は `/notifications-child`）を開く（Issue #354・#441）。
 */
export type MapRouteId =
  | "bank"
  | "board"
  | "exit"
  | "history"
  | "house"
  | "store"
  | "tasks"
  | "wardrobe";

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
 */
export type EquipmentSlot = "back" | "face" | "head";

/**
 * 装着スロットの一覧。**増やすときはここと `EquipmentSlot` だけ。**
 *
 * 並び順がそのまま組み立て順になる。順番を決めておくと、生成されるメッシュ名が
 * 実行ごとに入れ替わらない。検証（`parseMapObject`）もこの一覧を見る。
 */
export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ["back", "face", "head"];

/**
 * 着せ替え画面に出す枠の名前。
 *
 * `Record` にしてあるので、`EquipmentSlot` を増やすとここも埋めるまで型が通らない。
 * 子供が読むので、漢字を使わない。
 */
export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  back: "せなか",
  face: "かお",
  head: "あたま",
};
export type Season = "spring" | "summer" | "autumn" | "winter";

/**
 * 季節で色が変わる部品の種類（Issue #282）。
 *
 * パーツ（buildingParts.ts）に付けておくと、季節に合わせて色だけが変わる。
 * 形は作り直さない。どの季節に何色へ寄せるかは `lib/rpg-hub/seasonalLook.ts` が決める。
 *
 * - `blossom` … 広葉樹「き」の葉。春は桜、秋は紅葉（赤）
 * - `foliage` … そのほかの木と低木の葉。秋は黄葉（橙）
 * - `needle` … 針葉樹の葉。冬に雪をかぶるだけで、ほかの季節は変わらない
 * - `grass` … 草むらの葉。秋は枯れ草色
 * - `roof` … 建物の屋根。冬に雪をかぶる（建物の見分けがつくよう、元の色は残す）
 */
export type SeasonSlot = "blossom" | "foliage" | "grass" | "needle" | "roof";
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
   * キャラクター（プレイヤー・NPC）だけが使う。プレイヤー専用にしないのは、家族一人ひとりを
   * NPCとして立たせており（`NpcMapObject.familyMemberId`、Issue #255）、その人の装備を
   * 着せるため。付く位置はキャラクター側のアンカーが決める。
   */
  equipment?: Partial<Record<EquipmentSlot, AssetId>>;
  /**
   * 町のマス（lib/rpg-hub/townGrid.ts）で占める範囲。南西のマスと、一辺のマスの数（Issue #445）。
   *
   * 区画に置く建物・掲示板（4×4）と道のタイル（2×2）が、作るときに持つ。位置（position）は当たり判定に
   * 合わせて区画の中でずらすことがあるので、位置からは逆算しない。装飾は持たない（カタログの大きさと
   * 位置から求める。保存した装飾は座標しか持たないため）。
   */
  footprint?: { cells: number; col: number; row: number };
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
  /**
   * 上に浮かべる名札（子供が読むので、ひらがな）。家の中の機能のある家具（そとへ・きがえ）が持つ。
   * 何をする物か、近づく前から分かるようにするため（Issue #444）。町の建物は見た目で分かるので持たない
   */
  tag?: string;
  type: "building";
  /**
   * `route` が `"house"` のとき、この家の持ち主の `users.id`（Issue #244）。
   *
   * 家族一人ひとりの家を町に建てるため、`route: "house"` の建物が複数棟になる。
   * `NpcMapObject.familyMemberId` と同じ考え方で、どの建物が誰の家かをこれで区別する。
   * 自分の家（町に元からある1棟）には付けない（他の家と同じく、家の中へはテレポートで
   * 入る。`RpgHubScreen.tsx` の `handleTeleportRoute`）。
   * `buildFamilyHouses`（lib/rpg-hub/familyHouses.ts）が入れる。
   */
  houseOwnerId?: string;
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
   * 家族一人ひとりをNPCとして立たせるとき（Issue #255）の紐づけ先。取得した家族から
   * `buildFamilyNpcs`（lib/rpg-hub/familyNpcs.ts）が入れる。町の住人はこの値を持たない。
   * 会話は、この人の状況（クエスト数・残高）から `getDialogue` が組み立てる。
   */
  familyMemberId?: string;
  interactionRadius: number;
  interactive: true;
  /** 画面に出す呼び名。「〇〇とはなす」のように使う */
  name: string;
  type: "npc";
};

export type MapObject = BuildingMapObject | DecorationMapObject | NpcMapObject;
