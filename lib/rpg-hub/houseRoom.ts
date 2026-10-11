// 自分の家の中の部屋の中身と、キャラクターが部屋の中を歩き回る動き（Issue #386）。
//
// たまごっちの「マイハウス」のように、3Dで作った部屋を真横から見た固定の視点で映す。
// キャラクターは我が家タウンと同じくスティックで左右に歩かせ、家具に近づくとボタンが出て、
// きがえ・階段・外へ出る、などができる。しばらくスティックを触らないと、左右にうろうろ歩き出す。
//
// 描くのは WebView 側（webview/rpg-hub/houseRoom.ts）、機能を実行するのは RN 側
// （components/MyHouseScreen.tsx）。どちらも同じ部屋の定義と歩き方をここから読む。
//
// 横の位置は部屋の横幅を 0〜1 とした割合で持つ。3Dの座標への換算は `toRoomWorldX`。
//
// このモジュールは React Native / DOM / Babylon に依存しない純粋関数と定数のみ。

/** 家の階。1階と2階の2つ。 */
export type HouseFloor = "ground" | "upstairs";

export const HOUSE_FLOORS: readonly HouseFloor[] = ["ground", "upstairs"];

/**
 * 家具に近づいたときに出るボタンですること。
 * - wardrobe: きがえ画面を開く
 * - upstairs / downstairs: 階段で上の階・下の階へ行く
 * - exit: 家の外（我が家タウン）へ出る
 * - react: 何もしないが、キャラクターがひとこと話す
 */
export type HouseFurnitureAction = "downstairs" | "exit" | "react" | "upstairs" | "wardrobe";

/** 家具の形の種類。形そのものは lib/rpg-hub/houseRoomParts.ts が持つ */
export type HouseFurnitureKind =
  | "bed"
  | "bookshelf"
  | "closet"
  | "door"
  | "plant"
  | "sofa"
  | "stairsDown"
  | "stairsUp"
  | "toyBox"
  | "window";

export type HouseFurniture = {
  /** 何をするための家具か */
  action: HouseFurnitureAction;
  id: string;
  kind: HouseFurnitureKind;
  /** 読み上げ・名札に使う名前（子供が読むので、ひらがな中心） */
  label: string;
  /** action が react のとき、キャラクターが話すひとこと */
  reaction?: string;
  /**
   * いつも見えている名札。機能のある家具（きがえ・階段・外へ）にだけ付ける。
   * どれを押せば何が起きるかを、押す前から分かるようにするため。
   */
  tag?: string;
  /** 部屋の横幅に対する、家具の中心の位置（0〜1） */
  x: number;
};

export type HouseRoom = {
  furniture: readonly HouseFurniture[];
  /** 画面の見出し */
  title: string;
};

/**
 * 1階・2階の部屋の中身。
 *
 * 1階は「扉・クローゼット・窓・ソファ・植木・上りの階段」、2階は「下りの階段・ベッド・窓・本棚・おもちゃ箱」。
 * 以前の3Dの家の中（mapObjects.ts の「自分の家の中（Issue #235）」）の
 * 「1階に更衣室と上りの階段、2階に下りの階段」という並びは引き継いでいる。
 */
export const HOUSE_ROOMS: Record<HouseFloor, HouseRoom> = {
  ground: {
    furniture: [
      { action: "exit", id: "door", kind: "door", label: "げんかんの とびら", tag: "そとへ", x: 0.08 },
      { action: "wardrobe", id: "closet", kind: "closet", label: "クローゼット", tag: "きがえ", x: 0.27 },
      { action: "react", id: "window", kind: "window", label: "まど", reaction: "おそとが よくみえるね", x: 0.5 },
      { action: "react", id: "sofa", kind: "sofa", label: "ソファ", reaction: "ふかふか〜", x: 0.5 },
      { action: "react", id: "plant", kind: "plant", label: "うえき", reaction: "おみずを あげよう", x: 0.68 },
      { action: "upstairs", id: "stairs-up", kind: "stairsUp", label: "2かいへの かいだん", tag: "2かいへ", x: 0.87 },
    ],
    title: "自分の家",
  },
  upstairs: {
    furniture: [
      { action: "downstairs", id: "stairs-down", kind: "stairsDown", label: "1かいへの かいだん", tag: "1かいへ", x: 0.12 },
      { action: "react", id: "bed", kind: "bed", label: "ベッド", reaction: "すやすや… zzz", x: 0.38 },
      { action: "react", id: "window", kind: "window", label: "まど", reaction: "いい けしき！", x: 0.55 },
      { action: "react", id: "bookshelf", kind: "bookshelf", label: "ほんだな", reaction: "なにを よもうかな", x: 0.62 },
      { action: "react", id: "toy-box", kind: "toyBox", label: "おもちゃばこ", reaction: "いっしょに あそぼ！", x: 0.84 },
    ],
    title: "自分の家（2階）",
  },
};

// --- 部屋の大きさ（3Dの座標。1 = 1m 相当） ---

/** 部屋の横幅。ここを左右に歩く。縦長の画面でも小さくなりすぎないよう、広げすぎない */
export const ROOM_WIDTH = 8;
/** 部屋の奥行き。手前の壁は無く、そこから中を覗く */
export const ROOM_DEPTH = 3.2;
/** 部屋の高さ（床から天井まで） */
export const ROOM_HEIGHT = 3.6;
/** キャラクターが歩く線の奥行き（奥の壁を z = -ROOM_DEPTH として）。家具より少し手前 */
export const WALK_LINE_Z = -0.9;

/**
 * 割合の位置を、3Dの横の座標へ直す。部屋の中央が x = 0。
 * @param x - 部屋の横幅に対する位置（0〜1）
 * @returns 3Dの横の座標
 */
export function toRoomWorldX(x: number): number {
  return (x - 0.5) * ROOM_WIDTH;
}

/**
 * 部屋を映す枠の縦横比（横 / 縦）。部屋は横長なので、枠も横長にして部屋いっぱいを映す。
 * 縦長の枠にすると、部屋の上下が余って部屋そのものが小さく映る。
 */
export const ROOM_VIEW_ASPECT = 1.75;

/**
 * キャラクターが歩ける範囲（部屋の横幅に対する割合）。
 * 壁にめり込んで見えないよう、両端を少し空ける。
 */
export const CHARACTER_X_RANGE = { max: 0.93, min: 0.07 } as const;

/** 1回のうろうろで歩く距離の下限・上限（割合）。小さすぎると歩いたように見えない */
export const WANDER_STEP = { max: 0.35, min: 0.12 } as const;

/** うろうろ歩く速さ（1ミリ秒あたりに進む割合）。部屋の端から端までを約3.5秒で歩く */
export const WALK_SPEED_PER_MS = 1 / 3500;

/**
 * スティックを倒しきったときに歩く速さ（1ミリ秒あたりに進む割合）。部屋の端から端までを約2秒で歩く。
 * うろうろと同じ速さでは、自分で動かすには遅く感じた（実機での確認）。
 */
export const STICK_SPEED_PER_MS = 1 / 2000;

/** 立ち止まってから次に歩き出すまでの時間の下限・上限（ミリ秒） */
export const WANDER_PAUSE_MS = { max: 3500, min: 1500 } as const;

/**
 * スティックを離してから、ひとりでうろうろ歩き出すまでの時間（ミリ秒）。
 * 短いと、家具の前で止めてボタンを押そうとしている間に歩き出してしまう。
 */
export const IDLE_BEFORE_WANDER_MS = 8000;

/**
 * 家具に近づいたとみなす距離（部屋の横幅に対する割合）。この範囲に入るとボタンが出る。
 * 家具どうしの間（いちばん近い2階の窓と本棚で 0.07）より狭くして、隣の家具まで拾わないようにする。
 */
export const NEARBY_RANGE = 0.06;

/**
 * 値を歩ける範囲へ収める。
 * @param x - 位置（割合）
 * @returns 歩ける範囲に収めた位置
 */
export function clampCharacterX(x: number): number {
  return Math.min(CHARACTER_X_RANGE.max, Math.max(CHARACTER_X_RANGE.min, x));
}

/**
 * 次にうろうろ歩いて行く先を決める。
 *
 * 今の位置から `WANDER_STEP` の範囲の距離だけ、左右どちらかへ歩く。
 * 選んだ向きに十分な空きがなければ反対へ歩く（壁際で同じ場所に止まり続けないように）。
 * @param currentX - 今の位置（割合）
 * @param random - 0以上1未満の乱数を返す関数（テストで固定できるよう外から渡す）
 * @returns 行き先（割合）。必ず歩ける範囲の中
 */
export function pickWanderTarget(currentX: number, random: () => number): number {
  const from = clampCharacterX(currentX);
  const step = WANDER_STEP.min + random() * (WANDER_STEP.max - WANDER_STEP.min);
  const roomLeft = from - CHARACTER_X_RANGE.min;
  const roomRight = CHARACTER_X_RANGE.max - from;
  let goRight = random() < 0.5;
  if (goRight && roomRight < WANDER_STEP.min) goRight = false;
  else if (!goRight && roomLeft < WANDER_STEP.min) goRight = true;
  return clampCharacterX(goRight ? from + step : from - step);
}

/**
 * 立ち止まる時間を決める。
 * @param random - 0以上1未満の乱数を返す関数
 * @returns 立ち止まる時間（ミリ秒）
 */
export function pickWanderPauseMs(random: () => number): number {
  return Math.round(WANDER_PAUSE_MS.min + random() * (WANDER_PAUSE_MS.max - WANDER_PAUSE_MS.min));
}

/**
 * 1フレームぶん、行き先へ向かって歩かせる。行き過ぎないよう、行き先で止める。
 * @param x - 今の位置（割合）
 * @param targetX - 行き先（割合）
 * @param stepMs - 前のフレームからの時間（ミリ秒）
 * @returns 進んだあとの位置と、行き先に着いたかどうか
 */
export function stepTowardX(x: number, targetX: number, stepMs: number): { arrived: boolean; x: number } {
  const distance = targetX - x;
  const step = WALK_SPEED_PER_MS * Math.max(0, stepMs);
  if (Math.abs(distance) <= step) return { arrived: true, x: targetX };
  return { arrived: false, x: x + Math.sign(distance) * step };
}

/**
 * スティックの倒し具合に応じて、1フレームぶん左右に歩かせる。歩ける範囲の外へは出ない。
 * 倒しきったときの速さは `STICK_SPEED_PER_MS`（うろうろ歩くときより速い）。
 * @param x - 今の位置（割合）
 * @param input - スティックの左右の倒し具合（-1 で左いっぱい、1 で右いっぱい）
 * @param stepMs - 前のフレームからの時間（ミリ秒）
 * @returns 歩いたあとの位置（割合）
 */
export function stepByStick(x: number, input: number, stepMs: number): number {
  const amount = Math.min(1, Math.max(-1, input));
  return clampCharacterX(x + amount * STICK_SPEED_PER_MS * Math.max(0, stepMs));
}

/**
 * いま立っている位置から使える家具を探す（近づくとボタンが出る。我が家タウンの「入る」と同じ）。
 *
 * `NEARBY_RANGE` の中にある家具のうち、いちばん近いもの。
 * 機能のある家具（きがえ・階段・外へ）があれば、ひとこと話すだけの家具より先に選ぶ
 * （窓とソファのように重なって置いた家具の前でも、出口や階段を使えなくならないように）。
 * @param floor - いる階
 * @param x - 立っている位置（割合）
 * @returns 使える家具。近くに無ければ undefined
 */
export function findNearbyFurniture(floor: HouseFloor, x: number): HouseFurniture | undefined {
  const inRange = HOUSE_ROOMS[floor].furniture
    .map((furniture) => ({ distance: Math.abs(getFurnitureStandX(furniture) - x), furniture }))
    .filter((item) => item.distance <= NEARBY_RANGE)
    .sort((a, b) => a.distance - b.distance);
  return (inRange.find((item) => item.furniture.action !== "react") ?? inRange[0])?.furniture;
}

/**
 * 家具に近づいたときに出すボタンの絵文字と文言（子供が読むので、ひらがな中心）。
 * 読み上げにもこの文言を使うので、家具の名札と区別できる「〜する」の形にする。
 * @param furniture - 近くの家具
 * @returns ボタンの絵文字と文言
 */
export function getFurnitureButton(furniture: HouseFurniture): { emoji: string; label: string } {
  if (furniture.action === "exit") return { emoji: "🚪", label: "そとへ でる" };
  if (furniture.action === "wardrobe") return { emoji: "👗", label: "きがえる" };
  if (furniture.action === "upstairs") return { emoji: "🪜", label: "2かいへ いく" };
  if (furniture.action === "downstairs") return { emoji: "🪜", label: "1かいへ いく" };
  return { emoji: "🔍", label: `${furniture.label}を しらべる` };
}

/**
 * 家具を使うときに立つ位置（家具の正面）。
 * @param furniture - 使う家具
 * @returns 立つ位置（割合）
 */
export function getFurnitureStandX(furniture: HouseFurniture): number {
  return clampCharacterX(furniture.x);
}

/**
 * 階段を使って別の階へ着いたときに立つ位置。着いた階の、もう一方の階へ戻る階段の前。
 * @param floor - 着いた階
 * @returns 立つ位置（割合）
 */
export function getArrivalX(floor: HouseFloor): number {
  const stairs = HOUSE_ROOMS[floor].furniture.find(
    (item) => item.action === "upstairs" || item.action === "downstairs",
  );
  return stairs ? getFurnitureStandX(stairs) : 0.5;
}

/**
 * 町から家に入ってきたときに立つ位置。1階の玄関の扉の前。
 * @returns 立つ位置（割合）
 */
export function getEntranceX(): number {
  const door = HOUSE_ROOMS.ground.furniture.find((item) => item.action === "exit");
  return door ? getFurnitureStandX(door) : 0.5;
}

/**
 * 家具をIDで探す。
 * @param floor - 探す階
 * @param furnitureId - 家具のID
 * @returns 見つかった家具。無ければ undefined
 */
export function findHouseFurniture(floor: HouseFloor, furnitureId: string): HouseFurniture | undefined {
  return HOUSE_ROOMS[floor].furniture.find((item) => item.id === furnitureId);
}

/** キャラクターをタップしたときに話すひとこと（子供が読むので、ひらがな中心） */
export const CHARACTER_CHATTER: readonly string[] = [
  "きょうも がんばろう！",
  "おうちが いちばん！",
  "なにして あそぶ？",
  "クエスト、いってみる？",
];
