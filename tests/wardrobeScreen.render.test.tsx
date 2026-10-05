import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { Alert } from "react-native";

/**
 * 更衣室の画面（Issue #344）。
 *
 * 選んだものは保存せずプレビューに映し、「けってい」で変わった枠だけをまとめて保存する。
 * 確定せずに離れようとしたら確かめる。
 */

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

// 画面を離れるときの確認（beforeRemove）を確かめるため、登録されたリスナーを持っておく
type BeforeRemoveListener = (event: {
  data: { action: unknown };
  preventDefault: () => void;
}) => void;
const mockListeners: BeforeRemoveListener[] = [];
const mockDispatch = jest.fn();

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn() },
  useNavigation: () => ({
    addListener: (name: string, listener: BeforeRemoveListener) => {
      if (name !== "beforeRemove") return () => undefined;
      mockListeners.push(listener);
      return () => {
        const index = mockListeners.indexOf(listener);
        if (index >= 0) mockListeners.splice(index, 1);
      };
    },
    dispatch: mockDispatch,
  }),
}));

const mockSaveEquipment = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.mock("../lib/useWardrobe", () => ({
  useWardrobe: () => ({
    isReady: true,
    reload: () => Promise.resolve(),
    saveEquipment: (...args: unknown[]) => mockSaveEquipment(...args),
  }),
}));
jest.mock("../lib/useCharacterAppearance", () => ({
  useCharacterAppearance: () => ({ isReady: true }),
}));
jest.mock("../lib/useCharacterPalette", () => ({
  useCharacterPalette: () => ({ isReady: true }),
}));

// プレビューは WebView の中で描くので、ここでは受け取った見た目だけを見る
const mockPreviewLooks: unknown[] = [];
jest.mock("../components/rpg-hub-web/WardrobePreview", () => ({
  WardrobePreview: (props: { look: unknown }) => {
    mockPreviewLooks.push(props.look);
    return null;
  },
}));

import WardrobeScreen from "../components/WardrobeScreen";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets";
import { getAssetLabel } from "../lib/rpg-hub/catalog";
import { useAppStore } from "../store";
import { useWardrobeStore } from "../store/wardrobeStore";

const USER_ID = "22222222-2222-2222-2222-222222222222";
const HAT = RPG_HUB_ASSETS.wearableHat;
const GLASSES = RPG_HUB_ASSETS.wearableGlasses;

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.length = 0;
  mockPreviewLooks.length = 0;
  mockSaveEquipment.mockResolvedValue(undefined);
  useAppStore.setState({
    user: {
      balance: 0,
      created_at: "2026-07-01T00:00:00Z",
      family_id: "10000000-0000-4000-8000-000000000344",
      id: USER_ID,
      name: "たろう",
      role: "child",
    },
  });
  useWardrobeStore.setState({
    equipment: { head: HAT },
    equipmentLoadedFor: USER_ID,
    ownedAssetIds: [HAT, GLASSES],
  });
});

/** @returns 「けってい」ボタン */
const confirmButton = () => screen.getByTestId("wardrobe-confirm");

/** 枠を開いて選ぶ */
const choose = (slotLabel: RegExp, optionLabel: string) => {
  fireEvent.press(screen.getByLabelText(slotLabel));
  fireEvent.press(screen.getByLabelText(optionLabel));
};

/** @returns 最後にプレビューへ渡した装備 */
const lastPreviewEquipment = () =>
  (mockPreviewLooks[mockPreviewLooks.length - 1] as { equipment: unknown }).equipment;

test("何も変えていないときは「けってい」を押せない", () => {
  render(<WardrobeScreen />);

  expect(confirmButton()).toBeDisabled();
  expect(lastPreviewEquipment()).toEqual({ head: HAT });
});

test("選ぶと保存せずにプレビューへ映し、「けってい」を押せるようになる", () => {
  render(<WardrobeScreen />);

  choose(/^かお/, "かおをめがねにする");

  expect(lastPreviewEquipment()).toEqual({ face: GLASSES, head: HAT });
  expect(mockSaveEquipment).not.toHaveBeenCalled();
  expect(confirmButton()).toBeEnabled();
});

test("変えてから元に戻したら、また押せなくなる", () => {
  render(<WardrobeScreen />);

  choose(/^あたま/, "あたまをなしにする");
  expect(confirmButton()).toBeEnabled();
  // 開いたままの選択肢から、もとの帽子を選び直す
  fireEvent.press(screen.getByLabelText(`あたまを${getAssetLabel(HAT)}にする`));

  expect(confirmButton()).toBeDisabled();
});

test("「けってい」で変わった枠だけをまとめて保存する", async () => {
  render(<WardrobeScreen />);
  choose(/^かお/, "かおをめがねにする");
  choose(/^あたま/, "あたまをなしにする");

  await act(async () => {
    fireEvent.press(confirmButton());
  });

  expect(mockSaveEquipment).toHaveBeenCalledTimes(1);
  expect(mockSaveEquipment).toHaveBeenCalledWith([
    { assetId: GLASSES, slot: "face" },
    { assetId: null, slot: "head" },
  ]);
});

test("保存に失敗したら知らせ、選んだものは残して押し直せるようにする", async () => {
  mockSaveEquipment.mockRejectedValue(new Error("denied"));
  render(<WardrobeScreen />);
  choose(/^かお/, "かおをめがねにする");

  await act(async () => {
    fireEvent.press(confirmButton());
  });

  expect(screen.getByText("きがえを保存できませんでした")).toBeTruthy();
  expect(lastPreviewEquipment()).toEqual({ face: GLASSES, head: HAT });
  expect(confirmButton()).toBeEnabled();
});

test("変えたまま離れようとしたら確かめ、「やめる」を選んだときだけ離れる", () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  render(<WardrobeScreen />);
  choose(/^かお/, "かおをめがねにする");

  const preventDefault = jest.fn();
  const action = { type: "GO_BACK" };
  expect(mockListeners).toHaveLength(1);
  mockListeners[0]({ data: { action }, preventDefault });

  expect(preventDefault).toHaveBeenCalled();
  expect(alert).toHaveBeenCalledTimes(1);
  const buttons = alert.mock.calls[0][2] as { onPress?: () => void; text: string }[];
  expect(mockDispatch).not.toHaveBeenCalled();
  buttons.find((button) => button.text === "やめる")?.onPress?.();
  expect(mockDispatch).toHaveBeenCalledWith(action);
});

test("何も変えていなければ、確かめずにそのまま離れられる", () => {
  render(<WardrobeScreen />);

  expect(mockListeners).toHaveLength(0);
});

test("保存中に離れようとしたら止め、「やめる」は出さない（PR #346 レビュー対応）", async () => {
  // 「やめる」を選べても保存は止まらないので、捨てたつもりの変更が保存されてしまう
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  let finishSave: () => void = () => undefined;
  mockSaveEquipment.mockReturnValue(new Promise<void>((resolve) => (finishSave = resolve)));
  render(<WardrobeScreen />);
  choose(/^かお/, "かおをめがねにする");
  await act(async () => {
    fireEvent.press(confirmButton());
  });

  const preventDefault = jest.fn();
  mockListeners[mockListeners.length - 1]({ data: { action: { type: "GO_BACK" } }, preventDefault });

  expect(preventDefault).toHaveBeenCalled();
  const buttons = (alert.mock.calls[0][2] ?? []) as { text: string }[];
  expect(buttons.some((button) => button.text === "やめる")).toBe(false);
  expect(mockDispatch).not.toHaveBeenCalled();

  await act(async () => finishSave());
  // 保存し終えたら、確かめずに離れられる
  expect(mockListeners).toHaveLength(0);
});

test("利用者が変わったら、前の人の下書きを捨てる（PR #346 レビュー対応）", () => {
  render(<WardrobeScreen />);
  choose(/^かお/, "かおをめがねにする");
  expect(confirmButton()).toBeEnabled();

  act(() => {
    useAppStore.setState({
      user: {
        balance: 0,
        created_at: "2026-07-01T00:00:00Z",
        family_id: "10000000-0000-4000-8000-000000000344",
        id: "33333333-3333-3333-3333-333333333333",
        name: "はなこ",
        role: "child",
      },
    });
  });

  expect(lastPreviewEquipment()).toEqual({ head: HAT });
  expect(confirmButton()).toBeDisabled();
});

test("保存中に利用者が変わったら、失敗を今の人の画面に出さない（PR #346 レビュー対応）", async () => {
  let failSave: (error: Error) => void = () => undefined;
  mockSaveEquipment.mockReturnValue(new Promise<void>((_, reject) => (failSave = reject)));
  render(<WardrobeScreen />);
  choose(/^かお/, "かおをめがねにする");
  await act(async () => {
    fireEvent.press(confirmButton());
  });

  act(() => {
    useAppStore.setState({
      user: {
        balance: 0,
        created_at: "2026-07-01T00:00:00Z",
        family_id: "10000000-0000-4000-8000-000000000344",
        id: "33333333-3333-3333-3333-333333333333",
        name: "はなこ",
        role: "child",
      },
    });
  });
  await act(async () => failSave(new Error("denied")));

  expect(screen.queryByText("きがえを保存できませんでした")).toBeNull();
});
