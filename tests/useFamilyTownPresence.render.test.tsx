import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockSubscribe = jest.fn();
jest.mock("../lib/familyPresenceService.ts", () => ({
  subscribeToFamilyTownPresence: (...args: unknown[]) => mockSubscribe(...args),
}));

const mockUseFamilyMembers = jest.fn();
jest.mock("../lib/useFamilyMembers.ts", () => ({
  useFamilyMembers: () => mockUseFamilyMembers(),
}));

import { useFamilyTownPresence } from "../lib/useFamilyTownPresence";
import { useAppStore } from "../store";

const SELF_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const FAMILY_ID = "33333333-3333-3333-3333-333333333333";

function loginAsSelf() {
  useAppStore.setState({
    user: {
      balance: 0,
      created_at: "2026-01-01T00:00:00Z",
      family_id: FAMILY_ID,
      id: SELF_ID,
      name: "本人",
      role: "child",
    },
  });
}

let mockSubscription: { clearPosition: jest.Mock; setPosition: jest.Mock; stop: jest.Mock };
let latestOnChange: ((positions: Record<string, unknown>) => void) | null;

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: null });
  mockUseFamilyMembers.mockReturnValue({
    members: [
      { id: SELF_ID, name: "本人" },
      { id: OTHER_ID, name: "きょうだい" },
    ],
    reload: jest.fn(),
  });
  latestOnChange = null;
  mockSubscription = { clearPosition: jest.fn(), setPosition: jest.fn(), stop: jest.fn() };
  mockSubscribe.mockImplementation((_familyId: string, _userId: string, onChange: (p: unknown) => void) => {
    latestOnChange = onChange;
    return Promise.resolve(mockSubscription);
  });
});

test("ログイン中は家族ID・自分のユーザーIDで購読する", async () => {
  loginAsSelf();
  const { unmount } = renderHook(() =>
    useFamilyTownPresence(true, { facingY: 0, x: 0, z: 0 }),
  );
  await act(async () => {
    await Promise.resolve();
  });

  expect(mockSubscribe).toHaveBeenCalledWith(FAMILY_ID, SELF_ID, expect.any(Function));
  unmount();
});

test("ログインしていない（モックアカウント含む）ときは購読しない", async () => {
  renderHook(() => useFamilyTownPresence(true, { facingY: 0, x: 0, z: 0 }));
  await act(async () => {
    await Promise.resolve();
  });

  expect(mockSubscribe).not.toHaveBeenCalled();
});

test("町にいる間は自分の位置をsetPositionで知らせる", async () => {
  loginAsSelf();
  renderHook(() => useFamilyTownPresence(true, { facingY: 1.2, x: 3, z: -4 }));
  await act(async () => {
    await Promise.resolve();
  });

  expect(mockSubscription.setPosition).toHaveBeenCalledWith({ facingY: 1.2, x: 3, z: -4 });
});

test("町を離れたらclearPositionを呼び、setPositionは呼ばない", async () => {
  loginAsSelf();
  const { rerender } = renderHook(
    ({ isInTown }: { isInTown: boolean }) => useFamilyTownPresence(isInTown, { facingY: 0, x: 1, z: 1 }),
    { initialProps: { isInTown: true } },
  );
  await act(async () => {
    await Promise.resolve();
  });
  mockSubscription.setPosition.mockClear();

  rerender({ isInTown: false });

  expect(mockSubscription.clearPosition).toHaveBeenCalled();
  expect(mockSubscription.setPosition).not.toHaveBeenCalled();
});

test("他の家族の位置が届くと、色付きの矢印マーカーとして返す（自分は除く）", async () => {
  loginAsSelf();
  const { result } = renderHook(() => useFamilyTownPresence(true, { facingY: 0, x: 0, z: 0 }));
  await act(async () => {
    await Promise.resolve();
  });

  // subscribeToFamilyTownPresenceのonChangeは、自分自身を除いた位置だけを渡す
  // （tests/familyPresenceService.test.mjsで確認済み）。
  act(() => {
    latestOnChange?.({
      [OTHER_ID]: { facingY: 2, x: 5, z: 6 },
    });
  });

  expect(result.current).toEqual([{ color: expect.any(String), facingY: 2, id: OTHER_ID, x: 5, z: 6 }]);
});

test("アンマウント時にstopを呼ぶ", async () => {
  loginAsSelf();
  const { unmount } = renderHook(() => useFamilyTownPresence(true, { facingY: 0, x: 0, z: 0 }));
  await act(async () => {
    await Promise.resolve();
  });

  unmount();

  expect(mockSubscription.stop).toHaveBeenCalled();
});
