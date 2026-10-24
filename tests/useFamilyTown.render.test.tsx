import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { CHARACTER_TYPE_ASSET_IDS } from "../lib/rpg-hub/characterTypes";
import type { FamilyMember, FamilyQuestRow } from "../lib/rpg-hub/familyNpcs";

const mockSetFamily = jest.fn();
const mockTown = {
  familyPendingQuestCount: 1,
  members: [{ characterType: "cat", id: "kid", name: "子", role: "child", balance: 0, palette: {}, equipment: {}, acceptedQuestCount: 1, pendingQuestCount: 1 }] as FamilyMember[],
  quests: [
    { assigned_to: "kid", category: "limited", status: "accepted", expires_at: "2026-10-20T09:00:00Z" },
    { assigned_to: "kid", category: "limited", status: "pending", expires_at: "2026-10-20T09:00:00Z" },
  ] as FamilyQuestRow[],
};
let mockResourceTown = mockTown;
jest.mock("../lib/useResource", () => ({ useResource: () => ({ data: mockResourceTown }) }));
jest.mock("../store", () => ({
  useCurrentUser: () => ({ id: "parent", family_id: "family" }),
  useDataAccess: () => ({ canUseRealData: true }),
}));
jest.mock("../store/mapStore", () => ({ useMapStore: (selector: (state: unknown) => unknown) => selector({ setFamily: mockSetFamily, placedDecorations: [] }) }));

import { useFamilyTown } from "../lib/useFamilyTown";

beforeEach(() => {
  jest.clearAllMocks();
  mockResourceTown = mockTown;
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-20T08:59:30Z"));
});
afterEach(() => jest.useRealTimers());

test("再取得で同じ家族の選択種類と色が変わると、家族NPCの形と色も更新する", () => {
  mockResourceTown = {
    ...mockTown,
    members: [{ ...mockTown.members[0], characterType: "cat", palette: { accent: "#4a90e2" } }],
  };
  const { rerender } = renderHook(() => useFamilyTown());
  expect(mockSetFamily).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({
      familyMemberId: "kid",
      model: CHARACTER_TYPE_ASSET_IDS.cat,
      palette: { accent: "#4a90e2" },
    }),
  ]), expect.anything());

  // useResource が再取得した結果を、同じ利用者・同じ家族の町へ渡す。
  mockResourceTown = {
    ...mockTown,
    members: [{ ...mockTown.members[0], characterType: "frog", palette: { accent: "#e74c3c" } }],
  };
  mockSetFamily.mockClear();
  rerender({});

  expect(mockSetFamily).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({
      familyMemberId: "kid",
      model: CHARACTER_TYPE_ASSET_IDS.frog,
      palette: { accent: "#e74c3c" },
    }),
  ]), expect.anything());
});

test("町を開いたまま期限を迎えても作業中の数を更新し、承認待ちは残す", () => {
  renderHook(() => useFamilyTown());
  expect(mockSetFamily).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({
    familyPendingQuestCount: 1,
    members: { kid: expect.objectContaining({ acceptedQuestCount: 1, pendingQuestCount: 1 }) },
  }));
  act(() => jest.advanceTimersByTime(30_000));
  expect(mockSetFamily).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({ model: "player-cat", type: "npc", familyMemberId: "kid" }),
    expect.objectContaining({ houseOwnerId: "kid" }),
  ]), expect.anything());
  expect(mockSetFamily).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({
    familyPendingQuestCount: 1,
    members: { kid: expect.objectContaining({ acceptedQuestCount: 0, pendingQuestCount: 1 }) },
  }));
});
