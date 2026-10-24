import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import DecorationMode from "../components/rpg-hub-web/DecorationMode";
import { getSelectableFinishes } from "../lib/rpg-hub/houseFinishes";

const ASSET_IDS = [
  "decoration-bush",
  "decoration-bush-berry",
  "decoration-lamp",
  "decoration-tree",
  "decoration-tree-pine",
];

const handlers = {
  onDeselect: jest.fn(),
  onDragCancel: jest.fn(),
  onDragEnd: jest.fn(),
  onDragMove: jest.fn(),
  onDragStart: jest.fn(),
  onExit: jest.fn(),
  onRemove: jest.fn(),
  onResetView: jest.fn(),
  onRotate: jest.fn(),
};

/**
 * パネルを出す。既定は、どれも1つずつ残っていて、何も選んでいない状態。
 * @param overrides - 変えたい値
 */
async function renderPanel(overrides: Partial<Parameters<typeof DecorationMode>[0]> = {}) {
  return render(
    <DecorationMode
      assetIds={ASSET_IDS}
      availableCounts={Object.fromEntries(ASSET_IDS.map((assetId) => [assetId, 1]))}
      busy={false}
      message={null}
      placedCount={0}
      selected={null}
      {...handlers}
      {...overrides}
    />,
  );
}

const button = (name: string) => screen.getByRole("button", { name });

/**
 * その欄を上へ引っぱって置けるか。置けない欄は押せない（薄く出す）。
 * 引っぱる操作そのものは、欄の組み立てを変えずに内側で止めている（DecorationMode の DragSource）。
 * @param name - 欄の読み上げ名
 */
const isPlaceable = (name: string) => !button(name).props.accessibilityState?.disabled;

beforeEach(() => {
  Object.values(handlers).forEach((handler) => handler.mockClear());
});

describe("持っている装飾の一覧（Issue #477）", () => {
  test("1段目には種類だけを出し、中身は出さない", async () => {
    await renderPanel();

    expect(button("しげみをひらく")).toBeTruthy();
    expect(button("きをひらく")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^きのみのしげみ/ })).toBeNull();
  });

  test("1つしかない種類は、開かずにそのまま並べ、残りの数を読み上げる", async () => {
    await renderPanel({ availableCounts: { "decoration-lamp": 2 } });

    expect(button("ランプ　あと2こ")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "しゅるいのいちらんにもどる" })).toBeNull();
  });

  test("種類を開くと中身が並び、もどるで1段目に戻る", async () => {
    await renderPanel();

    await fireEvent.press(button("しげみをひらく"));
    expect(button("きのみのしげみ　あと1こ")).toBeTruthy();

    await fireEvent.press(button("しゅるいのいちらんにもどる"));
    expect(button("しげみをひらく")).toBeTruthy();
  });

  test("絵をタップすると、引っぱって置くことを案内する", async () => {
    await renderPanel();

    await fireEvent.press(button("ランプ　あと1こ"));

    expect(screen.getByText("えを うえに ひっぱって おいてね")).toBeTruthy();
  });

  test("残っている装飾は引っぱって置ける。置き切った装飾は薄く出して置けない", async () => {
    await renderPanel({
      availableCounts: { ...Object.fromEntries(ASSET_IDS.map((assetId) => [assetId, 1])), "decoration-lamp": 0 },
    });
    await fireEvent.press(button("きをひらく"));

    expect(isPlaceable("き　あと1こ")).toBe(true);
    await fireEvent.press(button("しゅるいのいちらんにもどる"));
    expect(isPlaceable("ランプ　あと0こ")).toBe(false);
  });

  test("置ける数の上限に達していたら、どれも引っぱれない", async () => {
    await renderPanel({ placedCount: 20 });

    expect(isPlaceable("ランプ　あと1こ")).toBe(false);
    expect(screen.getByText("20 / 20 こ")).toBeTruthy();
  });
});

describe("置いた装飾を選んだとき（Issue #477）", () => {
  test("一覧の代わりに「まわす」「しまう」「やめる」を出し、押すとそれぞれの操作を呼ぶ", async () => {
    await renderPanel({ selected: { canRemove: true, label: "ランプ" } });

    expect(screen.queryByRole("button", { name: "しげみをひらく" })).toBeNull();
    expect(screen.getByText("かざる ▸ ランプ")).toBeTruthy();

    await fireEvent.press(button("むきをまわす"));
    await fireEvent.press(button("えらんだかざりをしまう"));
    await fireEvent.press(button("えらぶのをやめる"));

    expect(handlers.onRotate).toHaveBeenCalledTimes(1);
    expect(handlers.onRemove).toHaveBeenCalledTimes(1);
    expect(handlers.onDeselect).toHaveBeenCalledTimes(1);
  });

  test("しまう処理の途中は「しまう」を押せない（二重にしまわない）", async () => {
    await renderPanel({ busy: true, selected: { canRemove: true, label: "ランプ" } });

    expect(button("えらんだかざりをしまう").props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button("えらんだかざりをしまう"));
    expect(handlers.onRemove).not.toHaveBeenCalled();
  });
});

test("家具（クローゼット）を選んだときは「しまう」を出さない（動かす・回すだけ）", async () => {
  await renderPanel({ selected: { canRemove: false, label: "クローゼット" } });

  expect(screen.getByText("かざる ▸ クローゼット")).toBeTruthy();
  expect(button("むきをまわす")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "えらんだかざりをしまう" })).toBeNull();
});

describe("パネル全体", () => {
  test("「おわる」で編集モードを終える", async () => {
    await renderPanel();

    await fireEvent.press(button("かざるのをおわる"));

    expect(handlers.onExit).toHaveBeenCalledTimes(1);
  });

  test("「もとに もどす」で、ズームと移動をやめる", async () => {
    await renderPanel();

    await fireEvent.press(button("みえかたをもとにもどす"));

    expect(handlers.onResetView).toHaveBeenCalledTimes(1);
  });

  test("置けなかった理由を出す", async () => {
    await renderPanel({ message: "ここには おけません" });

    expect(screen.getByText("ここには おけません")).toBeTruthy();
  });

  test("隠している高さ（下の余白を含む）を知らせる", async () => {
    const onCoveredHeightChange = jest.fn();
    await renderPanel({ onCoveredHeightChange });

    await fireEvent(screen.getByTestId("decoration-panel"), "layout", {
      nativeEvent: { layout: { height: 180, width: 360, x: 0, y: 0 } },
    });

    expect(onCoveredHeightChange).toHaveBeenCalledWith(192);
  });
});

describe("家の中の「かぐ」「かべ」「ゆか」のタブ（Issue #480）", () => {
  const finishes = (onSelect = jest.fn()) => ({
    current: { flooringId: "flooring-wood", wallpaperId: "wallpaper-brick" },
    flooring: getSelectableFinishes("flooring", []),
    onSelect,
    wallpaper: getSelectableFinishes("wallpaper", ["wallpaper-brick"]),
  });

  test("町（finishes が無いとき）ではタブを出さない", async () => {
    await renderPanel();
    expect(screen.queryByRole("tab", { name: "かべのタブ" })).toBeNull();
  });

  test("「かべ」を開くと持っている壁紙が並び、今の壁紙に印が付く。選ぶと onSelect が呼ばれる", async () => {
    const onSelect = jest.fn();
    await renderPanel({ finishes: finishes(onSelect) });
    await fireEvent.press(screen.getByRole("tab", { name: "かべのタブ" }));
    expect(screen.getByText("かざる ▸ かべ")).toBeTruthy();
    expect(button("れんが　つかっている")).toBeTruthy();
    await fireEvent.press(button("しっくいにかえる"));
    expect(onSelect).toHaveBeenCalledWith("wallpaper", "wallpaper-plaster");
    // 家具の一覧は出さない
    expect(screen.queryByRole("button", { name: "しげみをひらく" })).toBeNull();
  });

  test("床板を1つも買っていなければ、ストアで買えることを知らせる", async () => {
    await renderPanel({ finishes: finishes() });
    await fireEvent.press(screen.getByRole("tab", { name: "ゆかのタブ" }));
    expect(button("きのゆか　つかっている")).toBeTruthy();
    expect(screen.getByText("ストアの「かぐ」の棚で買うと えらべるよ")).toBeTruthy();
  });

  test("タブを切り替えると、選んでいた装飾の選択を外す", async () => {
    await renderPanel({ finishes: finishes(), selected: { canRemove: true, label: "き" } });
    await fireEvent.press(screen.getByRole("tab", { name: "ゆかのタブ" }));
    expect(handlers.onDeselect).toHaveBeenCalled();
  });
});
