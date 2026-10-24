/**
 * かざるの編集モード（Issue #477）の、シーン側の操作。
 *
 * - カメラ: プレイヤーを追わず、部屋全体（町では足元のまわり）を斜め上から見下ろす（`editView.ts`）
 * - マス目: 映している範囲の床にマスの線を引く
 * - タップ: 置いた装飾・動かせる家具をタップしたら、その id を RN へ送る（RN が選択状態にして「まわす」などを出す）
 * - 長押し: 置いた装飾・動かせる家具を持ち上げ、指を動かすとマスにそろえて動かす。離したマスを RN へ送る
 * - 1本指ですぐなぞる: 見え方を動かす。2本指でつまむ・広げる: ズーム（範囲全体より小さくはしない）
 * - 一覧から引っぱる: RN が指の位置を送ってくるので（`editDrag`）、指の下のマスに目印を出し、
 *   離したマスを RN へ送る
 *
 * 置けるかの最終判断と保存は RN 側が行う（行けなくなる建物が無いかの確認が重いため）。
 * ここでは目印の色のために、軽い判定（`isPlacementSpotBlocked`）だけを使う。
 *
 * 編集モードの間は RN が仮想パッドを止めるので、指の操作はすべてここへ届く。
 */
import {
  applyEditView,
  clampEditView,
  type EditArea,
  type EditInsets,
  type EditViewState,
  EDIT_CAMERA_OFFSET,
  fitOrthoToPoints,
  getEditAreaCenter,
  getEditAreaCorners,
  getEditStandPoint,
  INITIAL_EDIT_VIEW,
  type OrthoBounds,
  panEditView,
  zoomEditViewAt,
} from "../../lib/rpg-hub/editView";
import { HOUSE_GRID_ORIGIN } from "../../lib/rpg-hub/houseInterior";
import {
  findEditableAt,
  getFurnitureCells,
  isEditableId,
  isFurnitureSpotBlocked,
  isMovableFurnitureId,
  placeFurnitureAt,
} from "../../lib/rpg-hub/houseFurniture";
import {
  createDecorationCandidate,
  isPlacementSpotBlocked,
} from "../../lib/rpg-hub/placementSpot";
import { getDecorationCells, getGridAt, TOWN_CELL_SIZE } from "../../lib/rpg-hub/townGrid";
import type { RpgHubEvent } from "../../lib/rpg-hub/bridge";
import type { MapObject } from "../../types/map";
import { createCellMarker } from "./placementMarker";

// Babylon UMD がグローバルに載せる名前空間（scene.ts と同じ理由で any で受ける）。
declare const BABYLON: any;

/** 押したまま、これだけ経ったら持ち上げる（ミリ秒）。 */
export const LONG_PRESS_MS = 400;

/** 指がこれ以上動いたら、タップでも長押しでもないとみなす（CSSピクセル）。 */
const TAP_SLOP_PX = 10;

/** 持ち上げたとき、どれだけ浮かせるか。持ち上がったことが一目で分かる高さ。 */
const LIFT_HEIGHT = 0.45;

/** 持ち上げたとき、少しだけ大きく見せる倍率。 */
const LIFT_SCALE = 1.1;

/** マス目の線の高さ。家の中の床の上面（y = 0）よりわずかに上。 */
const GRID_Y = 0.012;

/** マス目の線の色と濃さ。床の色を邪魔しない程度に薄くする。 */
const GRID_COLOR = "#ffffff";
const GRID_ALPHA = 0.45;

/** 置いた装飾のルートノードの名前の頭。`object-${id}`（scene.ts の buildObject） */
const ROOT_NAME_PREFIX = "object-";

export type DecorationEditorDeps = {
  camera: any;
  canvas: HTMLCanvasElement;
  /** id からルートノードを引く（scene.ts の objectRoots） */
  getRoot: (id: string) => any;
  getObjects: () => readonly MapObject[];
  getPlayerPosition: () => { x: number; z: number };
  post: (event: RpgHubEvent) => void;
  /** 編集モードをやめたとき、普段の正射影の範囲へ戻す（scene.ts の applyOrthoSize） */
  restoreOrtho: () => void;
  /** キャラクターを出す・消す。編集モードの間は消す（置く邪魔になるため） */
  setPlayerVisible: (visible: boolean) => void;
  scene: any;
};

export type DecorationEditor = {
  /**
   * 編集モードの間、カメラを範囲の上へ置く。毎フレーム呼ぶ。
   * @returns 編集モードでカメラを動かしたら true（呼び出し側は普段の追従をしない）
   */
  applyCamera: () => boolean;
  /**
   * 一覧から引っぱっている指の位置を受け取る（`editDrag`）。
   * @param assetId - 引っぱっている装飾
   * @param phase - 動かしている・離した・取りやめた
   * @param x - WebView の左端からのCSSピクセル
   * @param y - WebView の上端からのCSSピクセル
   */
  drag: (assetId: string, phase: "cancel" | "end" | "move", x: number, y: number) => void;
  /** 影や地面を合わせる中心。編集モードでなければ null（プレイヤーに合わせる） */
  getFocus: () => { x: number; z: number } | null;
  isActive: () => boolean;
  /** マップを作り直したとき。持ち上げていた装飾のノードは捨てられているので、持ち上げをやめる */
  onMapRebuilt: () => void;
  /** 画面の大きさが変わったとき。範囲を収め直す */
  refit: () => void;
  /** 指で変えたズームと移動をやめ、範囲全体が収まる見え方へ戻す（`resetEditView`） */
  resetView: () => void;
  /**
   * 編集モードを始める・やめる（`setEditMode`）。
   * @param area - 映す範囲。null ならやめる
   * @param insets - 画面の上下で RN のUIが隠している高さ
   */
  setMode: (area: EditArea | null, insets: EditInsets) => void;
  /**
   * 選んでいる装飾を変える（`setEditSelection`）。
   * @param id - 選んでいる装飾のid。null なら選んでいない
   */
  setSelection: (id: string | null) => void;
  /**
   * 毎フレーム呼ぶ。目印を動かす。
   * @param nowMs - 今の時刻（ミリ秒）
   */
  update: (nowMs: number) => void;
};

/** 押している指の状態。持ち上げる前。 */
type Press = {
  pointerId: number;
  startedAt: number;
  /** 押した所にあった、置いた装飾のid */
  targetId: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  moved: boolean;
  x: number;
  y: number;
};

/** 持ち上げている装飾。 */
type Lifted = {
  id: string;
  /** 持ち上げた物（持ち上げたときの位置・向きのもの） */
  object: MapObject;
  /** 指の下の床の点から、装飾の中心までのずれ。指で押した所のまま動くように */
  offset: { x: number; z: number };
  original: { x: number; y: number; z: number };
  originalScale: number;
  pointerId: number;
  root: any;
  /** いま置こうとしているマスの中心と、置けないか */
  target: Target;
};

/** 置こうとしているマス。占めるマスの数（家具は長方形のことがある）と、置けないか */
type Target = { blocked: boolean; cols: number; rows: number; x: number; z: number };

/**
 * 編集モードの操作を作る。作った直後は編集モードではない。
 * @param deps - シーンとのつなぎ
 * @returns 編集モードの操作
 */
export function createDecorationEditor(deps: DecorationEditorDeps): DecorationEditor {
  const scene = deps.scene;
  const camera = deps.camera;
  const hoverMarker = createCellMarker(scene, "edit-hover");
  const selectionMarker = createCellMarker(scene, "edit-selection");

  let area: EditArea | null = null;
  let insets: EditInsets = { bottom: 0, top: 0 };
  /** 範囲全体が、画面のUIに隠れない部分へ収まる見え方 */
  let baseOrtho: OrthoBounds | null = null;
  /** 指で変えたズームと移動。編集モードを始めるたびに戻す */
  let view: EditViewState = INITIAL_EDIT_VIEW;
  /** 実際にカメラへ渡す範囲（baseOrtho に view を重ねたもの） */
  let ortho: OrthoBounds | null = null;
  let selectionId: string | null = null;
  let gridLines: any = null;
  let press: Press | null = null;
  let lifted: Lifted | null = null;
  /** 一覧から引っぱっている装飾と、指の下のマス */
  let trayDrag: { assetId: string; target: Target | null } | null = null;
  /** 画面に触れている指（ポインタid → 位置）。2本そろったらズームにする */
  const pointers = new Map<number, { x: number; y: number }>();
  /** 1本指でなぞって見え方を動かしている指と、前に見た位置 */
  let panning: { last: { x: number; y: number }; pointerId: number } | null = null;
  /** 2本指でズームしているときの、前に見た指の間の距離とまん中 */
  let pinch: { distance: number; middle: { x: number; y: number } } | null = null;

  /**
   * 置けるかの判定に使うプレイヤーの位置（家の中では玄関の出口の前。editView.ts の getEditStandPoint）。
   * 編集モードの間はキャラクターを消しているので、見えない所にぶつかって置けない、が起きないようにする
   * @returns 判定に使う位置
   */
  function standPoint(): { x: number; z: number } {
    return getEditStandPoint(deps.getPlayerPosition(), deps.getObjects());
  }

  /**
   * 画面の点の真下にある床（y = 0）の点を求める。
   * @param x - WebView の左端からのCSSピクセル
   * @param y - WebView の上端からのCSSピクセル
   * @returns 床の点。床を向いていなければ null
   */
  function groundPointAt(x: number, y: number): { x: number; z: number } | null {
    // createPickingRay は CSSピクセルを受け取り、描画の解像度への換算は Babylon がする
    const ray = scene.createPickingRay(x, y, BABYLON.Matrix.Identity(), camera);
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const distance = -ray.origin.y / ray.direction.y;
    if (distance < 0) return null;
    return { x: ray.origin.x + ray.direction.x * distance, z: ray.origin.z + ray.direction.z * distance };
  }

  /**
   * ノードから上へたどって、置いた装飾のルートノードの id を返す。
   * @param mesh - 指が当たったメッシュ
   * @returns 置いた装飾のid。置いた装飾でなければ null
   */
  function placedIdOfMesh(mesh: any): string | null {
    let node = mesh;
    while (node) {
      const name: string = node.name ?? "";
      if (name.startsWith(ROOT_NAME_PREFIX)) {
        const id = name.slice(ROOT_NAME_PREFIX.length);
        if (isEditableId(id) && deps.getRoot(id) === node) return id;
      }
      node = node.parent;
    }
    return null;
  }

  /**
   * 画面の点にある、置いた装飾を探す。まず3Dの形に当たるかを見て、当たらなければ真下のマスで探す。
   * @param x - WebView の左端からのCSSピクセル
   * @param y - WebView の上端からのCSSピクセル
   * @returns 置いた装飾のid。無ければ null
   */
  function findPlacedAt(x: number, y: number): string | null {
    // 置いた装飾は、普段はタップの対象から外してある（後ろの住人を拾えなくなるため）。
    // ここでは条件を渡して、置いた装飾のメッシュだけを当てる（条件を渡すと isPickable は見られない）
    const pick = scene.pick(x, y, (mesh: any) => mesh.isEnabled() && mesh.isVisible && placedIdOfMesh(mesh) !== null);
    const picked = pick?.hit ? placedIdOfMesh(pick.pickedMesh) : null;
    if (picked) return picked;
    const ground = groundPointAt(x, y);
    return ground ? findEditableAt(deps.getObjects(), ground.x, ground.z) : null;
  }

  /**
   * 一覧から引っぱってきた装飾を置こうとしているマスを求める。
   * @param assetId - 置く装飾
   * @param point - 指の下の床の点
   * @returns マスの中心と、置けないか。装飾でなければ null
   */
  function targetForNew(assetId: string, point: { x: number; z: number }): Target | null {
    const candidate = createDecorationCandidate(assetId, point);
    const cells = getDecorationCells(assetId);
    if (!candidate || cells === null) return null;
    return {
      blocked: isPlacementSpotBlocked(candidate, deps.getObjects(), standPoint()),
      cols: cells,
      rows: cells,
      x: candidate.position.x,
      z: candidate.position.z,
    };
  }

  /**
   * 持ち上げている物（置いた装飾・家具）を置こうとしているマスを求める。向きは今のまま。
   * @param object - 持ち上げている物
   * @param point - 指の下の床の点にずれを足した点
   * @returns マスの中心と、置けないか。置けない種類の物なら null
   */
  function targetForObject(object: MapObject, point: { x: number; z: number }): Target | null {
    const rotationY = object.rotationY ?? 0;
    if (isMovableFurnitureId(object.id)) {
      // 家具は長方形のことがあり、正面（使うときに立つ所）も空いていなければならない
      const candidate = placeFurnitureAt(object, point, rotationY);
      const cells = getFurnitureCells(candidate);
      return {
        blocked: isFurnitureSpotBlocked(candidate, deps.getObjects(), standPoint()),
        cols: cells.cols,
        rows: cells.rows,
        x: candidate.position.x,
        z: candidate.position.z,
      };
    }
    const candidate = createDecorationCandidate(object.model, point, rotationY, object.id);
    const cells = getDecorationCells(object.model);
    if (!candidate || cells === null) return null;
    return {
      blocked: isPlacementSpotBlocked(candidate, deps.getObjects(), standPoint()),
      cols: cells,
      rows: cells,
      x: candidate.position.x,
      z: candidate.position.z,
    };
  }

  /**
   * 選んでいる物の、今の場所の目印の大きさ。
   * @param object - 選んでいる物
   * @returns 占めるマスの数
   */
  function cellsOf(object: MapObject): { cols: number; rows: number } {
    if (isMovableFurnitureId(object.id)) return getFurnitureCells(object);
    const cells = getDecorationCells(object.model) ?? 1;
    return { cols: cells, rows: cells };
  }

  /** マス目の線を引き直す。範囲が無ければ消す。 */
  function rebuildGrid(): void {
    if (gridLines) {
      gridLines.dispose();
      gridLines = null;
    }
    if (!area) return;
    const lines: any[][] = [];
    const center = getEditAreaCenter(area);
    // 家の中は床の角、町は出発地点をマス(0, 0)の角にする（townGrid.ts）
    const origin = getGridAt(center.x, center.z) === "house" ? HOUSE_GRID_ORIGIN : { x: 0, z: 0 };
    const startCol = Math.ceil((area.minX - origin.x) / TOWN_CELL_SIZE - 1e-6);
    const startRow = Math.ceil((area.minZ - origin.z) / TOWN_CELL_SIZE - 1e-6);
    for (let col = startCol; origin.x + col * TOWN_CELL_SIZE <= area.maxX + 1e-6; col += 1) {
      const x = origin.x + col * TOWN_CELL_SIZE;
      lines.push([new BABYLON.Vector3(x, GRID_Y, area.minZ), new BABYLON.Vector3(x, GRID_Y, area.maxZ)]);
    }
    for (let row = startRow; origin.z + row * TOWN_CELL_SIZE <= area.maxZ + 1e-6; row += 1) {
      const z = origin.z + row * TOWN_CELL_SIZE;
      lines.push([new BABYLON.Vector3(area.minX, GRID_Y, z), new BABYLON.Vector3(area.maxX, GRID_Y, z)]);
    }
    gridLines = BABYLON.MeshBuilder.CreateLineSystem("edit-grid", { lines }, scene);
    gridLines.color = BABYLON.Color3.FromHexString(GRID_COLOR);
    gridLines.alpha = GRID_ALPHA;
    gridLines.isPickable = false;
  }

  /** カメラを範囲の上へ置き、範囲が画面のUIに隠れない部分へ収まるよう、正射影の範囲を決める。 */
  function fit(): void {
    if (!area) return;
    placeCamera(area);
    // `view`（指で変えた見え方）と取り違えないよう、別の名前にする
    const viewMatrix = camera.getViewMatrix(true);
    const points = getEditAreaCorners(area).map((corner) => {
      const projected = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(corner.x, corner.y, corner.z), viewMatrix);
      return { x: projected.x, y: projected.y };
    });
    baseOrtho = fitOrthoToPoints(points, screenSize(), insets);
    applyView(view);
  }

  /** 画面の大きさ（CSSピクセル） */
  function screenSize(): { height: number; width: number } {
    return { height: deps.canvas.clientHeight, width: deps.canvas.clientWidth };
  }

  /**
   * 指で変えた見え方を、範囲から外れないよう収めてカメラへ渡す範囲にする。
   * @param next - 新しい見え方
   */
  function applyView(next: EditViewState): void {
    if (!baseOrtho) return;
    view = clampEditView(baseOrtho, next);
    ortho = applyEditView(baseOrtho, view);
  }

  /**
   * 触れている指のうち、はじめの2本の距離とまん中。
   * @returns 2本そろっていなければ null
   */
  function twoFingers(): { distance: number; middle: { x: number; y: number } } | null {
    const points = Array.from(pointers.values());
    if (points.length < 2) return null;
    const a = points[0];
    const b = points[1];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  /** 2本指で、つまむ・広げる（ズーム）とまん中を動かす（移動）を同時に扱う */
  function updatePinch(): void {
    const fingers = twoFingers();
    if (!pinch || !fingers || !baseOrtho) return;
    const screen = screenSize();
    let next = view;
    if (pinch.distance > 0 && fingers.distance > 0) {
      next = zoomEditViewAt(baseOrtho, next, next.zoom * (fingers.distance / pinch.distance), {
        u: fingers.middle.x / Math.max(1, screen.width),
        v: fingers.middle.y / Math.max(1, screen.height),
      });
    }
    next = panEditView(
      baseOrtho,
      next,
      { x: fingers.middle.x - pinch.middle.x, y: fingers.middle.y - pinch.middle.y },
      screen,
    );
    applyView(next);
    pinch = fingers;
  }

  /**
   * カメラを範囲の中心の上へ置く。
   * @param target - 映す範囲
   */
  function placeCamera(target: EditArea): void {
    const center = getEditAreaCenter(target);
    camera.position.set(center.x + EDIT_CAMERA_OFFSET.x, EDIT_CAMERA_OFFSET.y, center.z + EDIT_CAMERA_OFFSET.z);
    camera.setTarget(new BABYLON.Vector3(center.x, 0, center.z));
  }

  /**
   * 持ち上げた装飾を元の高さ・大きさへ下ろし、動かないものとして固め直す。
   * @param at - 下ろす位置。省略時は元の位置
   */
  function putDown(at?: { x: number; z: number }): void {
    if (!lifted) return;
    const root = lifted.root;
    if (!root.isDisposed()) {
      root.position.set(at ? at.x : lifted.original.x, lifted.original.y, at ? at.z : lifted.original.z);
      root.scaling.set(lifted.originalScale, lifted.originalScale, lifted.originalScale);
      root.freezeWorldMatrix();
      root.getChildMeshes().forEach((mesh: any) => mesh.freezeWorldMatrix());
    }
    lifted = null;
    hoverMarker.hide();
  }

  /** 長押しが成立したので、押していた装飾を持ち上げる。 */
  function lift(): void {
    if (!press || !press.targetId) return;
    const id = press.targetId;
    const root = deps.getRoot(id);
    const object = deps.getObjects().find((candidate) => candidate.id === id);
    const ground = groundPointAt(press.x, press.y);
    if (!root || !object || !ground) return;
    // 動かすので、固めておいたワールド行列を解く（buildObject で凍結している）
    root.unfreezeWorldMatrix();
    root.getChildMeshes().forEach((mesh: any) => mesh.unfreezeWorldMatrix());
    const scale = object.scale ?? 1;
    const cells = cellsOf(object);
    lifted = {
      id,
      object,
      offset: { x: object.position.x - ground.x, z: object.position.z - ground.z },
      original: { x: object.position.x, y: object.position.y, z: object.position.z },
      originalScale: scale,
      pointerId: press.pointerId,
      root,
      target: { blocked: false, cols: cells.cols, rows: cells.rows, x: object.position.x, z: object.position.z },
    };
    root.position.y = object.position.y + LIFT_HEIGHT;
    root.scaling.set(scale * LIFT_SCALE, scale * LIFT_SCALE, scale * LIFT_SCALE);
    press = null;
    deps.post({ event: "editLift", id });
  }

  /**
   * 持ち上げている装飾を、指の下のマスへ動かす。
   * @param x - WebView の左端からのCSSピクセル
   * @param y - WebView の上端からのCSSピクセル
   */
  function moveLifted(x: number, y: number): void {
    if (!lifted) return;
    const ground = groundPointAt(x, y);
    if (!ground) return;
    const target = targetForObject(lifted.object, { x: ground.x + lifted.offset.x, z: ground.z + lifted.offset.z });
    if (!target) return;
    lifted.target = target;
    lifted.root.position.x = target.x;
    lifted.root.position.z = target.z;
  }

  /**
   * 指の位置を、キャンバスの左上からのCSSピクセルにする。
   * @param event - ポインタのイベント
   * @returns キャンバス内の位置
   */
  function localPoint(event: PointerEvent): { x: number; y: number } {
    const rect = deps.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** 押している指の記録を捨てる。 */
  function clearPress(): void {
    if (press?.timer) clearTimeout(press.timer);
    press = null;
  }

  deps.canvas.addEventListener("pointerdown", (event: PointerEvent) => {
    if (!area) return;
    const point = localPoint(event);
    pointers.set(event.pointerId, point);
    // 持ち上げている間・一覧から引っぱっている間は、ほかの指を相手にしない
    if (lifted || trayDrag) return;
    if (pointers.size === 2) {
      // 2本目の指が触れたらズームにする。1本目でしていたタップ・長押し・移動はやめる
      clearPress();
      panning = null;
      pinch = twoFingers();
      return;
    }
    if (pointers.size > 2 || pinch) return;
    const targetId = findPlacedAt(point.x, point.y);
    press = {
      moved: false,
      pointerId: event.pointerId,
      startedAt: performance.now(),
      targetId,
      timer: targetId ? setTimeout(lift, LONG_PRESS_MS) : null,
      x: point.x,
      y: point.y,
    };
  });

  deps.canvas.addEventListener("pointermove", (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    const point = localPoint(event);
    pointers.set(event.pointerId, point);
    if (lifted && event.pointerId === lifted.pointerId) {
      moveLifted(point.x, point.y);
      return;
    }
    if (pinch) {
      updatePinch();
      return;
    }
    if (panning && event.pointerId === panning.pointerId) {
      if (baseOrtho) {
        applyView(
          panEditView(baseOrtho, view, { x: point.x - panning.last.x, y: point.y - panning.last.y }, screenSize()),
        );
      }
      panning.last = point;
      return;
    }
    if (!press || event.pointerId !== press.pointerId || press.moved) return;
    if (Math.hypot(point.x - press.x, point.y - press.y) <= TAP_SLOP_PX) return;
    // 長押しになる前に動かしたら、タップでも長押しでもなく、見え方を動かす操作にする。
    // ここから動かし始める（それまでに動いた分で、見え方が跳ねないように）
    press.moved = true;
    if (press.timer) clearTimeout(press.timer);
    press.timer = null;
    panning = { last: point, pointerId: event.pointerId };
  });

  /**
   * 指が離れた・取り消されたときの共通の後始末。
   * @param event - ポインタのイベント
   * @param cancelled - 取り消された（pointercancel）なら true
   */
  function releasePointer(event: PointerEvent, cancelled: boolean): void {
    pointers.delete(event.pointerId);
    if (lifted && event.pointerId === lifted.pointerId) {
      if (cancelled) {
        putDown();
        return;
      }
      const current = lifted;
      const point = localPoint(event);
      moveLifted(point.x, point.y);
      const target = current.target;
      // 置けると出ている所なら、RN の判断を待たずにそこへ下ろしておく（保存が終わるまで戻って見えないように）。
      // RN が断ったら、マップを送り直してもらって元へ戻る
      putDown(target.blocked ? undefined : target);
      deps.post({ assetId: current.object.model, event: "editDrop", id: current.id, x: target.x, z: target.z });
      return;
    }
    if (pinch) {
      // 2本のうち1本が離れたらズームを終える。残った指では、離すまで何もしない
      if (pointers.size < 2) pinch = null;
      return;
    }
    if (panning && event.pointerId === panning.pointerId) {
      panning = null;
      clearPress();
      return;
    }
    if (!press || event.pointerId !== press.pointerId) return;
    const tapped = !cancelled && !press.moved && performance.now() - press.startedAt < LONG_PRESS_MS;
    const targetId = press.targetId;
    clearPress();
    if (tapped) deps.post({ event: "editTap", id: targetId });
  }

  deps.canvas.addEventListener("pointerup", (event: PointerEvent) => releasePointer(event, false));
  deps.canvas.addEventListener("pointercancel", (event: PointerEvent) => releasePointer(event, true));

  /** 指の操作の途中経過をすべて捨てる（編集モードを終えたとき） */
  function clearGestures(): void {
    clearPress();
    pointers.clear();
    panning = null;
    pinch = null;
  }

  return {
    applyCamera() {
      if (!area || !ortho) return false;
      placeCamera(area);
      camera.orthoLeft = ortho.left;
      camera.orthoRight = ortho.right;
      camera.orthoTop = ortho.top;
      camera.orthoBottom = ortho.bottom;
      return true;
    },
    drag(assetId, phase, x, y) {
      if (!area) return;
      if (phase === "cancel") {
        trayDrag = null;
        hoverMarker.hide();
        return;
      }
      const ground = groundPointAt(x, y);
      const target = ground ? targetForNew(assetId, ground) : null;
      if (phase === "move") {
        trayDrag = { assetId, target };
        return;
      }
      trayDrag = null;
      hoverMarker.hide();
      if (target) deps.post({ assetId, event: "editDrop", id: null, x: target.x, z: target.z });
    },
    getFocus() {
      return area ? getEditAreaCenter(area) : null;
    },
    isActive() {
      return area !== null;
    },
    onMapRebuilt() {
      // 作り直したノードは新しい位置で凍結されているので、下ろす処理は要らない
      lifted = null;
      clearPress();
      hoverMarker.hide();
    },
    refit() {
      fit();
    },
    resetView() {
      applyView(INITIAL_EDIT_VIEW);
    },
    setMode(nextArea, nextInsets) {
      const wasActive = area !== null;
      area = nextArea;
      insets = nextInsets;
      if (!area) {
        putDown();
        clearGestures();
        trayDrag = null;
        selectionId = null;
        baseOrtho = null;
        ortho = null;
        view = INITIAL_EDIT_VIEW;
        hoverMarker.hide();
        selectionMarker.hide();
        rebuildGrid();
        if (wasActive) {
          deps.restoreOrtho();
          deps.setPlayerVisible(true);
        }
        return;
      }
      deps.setPlayerVisible(false);
      // 始めたときは範囲全体を見せる。パネルの高さが決まって送り直されたときは、指で変えた見え方を保つ
      if (!wasActive) view = INITIAL_EDIT_VIEW;
      fit();
      rebuildGrid();
    },
    setSelection(id) {
      selectionId = id;
    },
    update(nowMs) {
      if (!area) return;
      const hover = lifted ? lifted.target : trayDrag?.target;
      if (hover) {
        hoverMarker.show(hover.x, hover.z, hover.cols, hover.rows, hover.blocked, nowMs);
      } else {
        hoverMarker.hide();
      }
      const selected = selectionId && !lifted ? deps.getObjects().find((object) => object.id === selectionId) : null;
      if (selected) {
        const cells = cellsOf(selected);
        selectionMarker.show(selected.position.x, selected.position.z, cells.cols, cells.rows, false, nowMs);
      } else {
        selectionMarker.hide();
      }
    },
  };
}
