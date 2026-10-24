import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
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
jest.mock("../lib/useResource", () => ({ useResource: () => ({ data: mockTown }) }));
jest.mock("../store", () => ({
  useCurrentUser: () => ({ id: "parent", family_id: "family" }),
  useDataAccess: () => ({ canUseRealData: true }),
}));
jest.mock("../store/mapStore", () => ({ useMapStore: (selector: (state: unknown) => unknown) => selector({ setFamily: mockSetFamily, placedDecorations: [] }) }));

import { useFamilyTown } from "../lib/useFamilyTown";

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-20T08:59:30Z"));
});
afterEach(() => jest.useRealTimers());

test("町を開いたまま期限を迎えても作業中の数を更新し、承認待ちは残す", async () => {
  await renderHook(() => useFamilyTown());
  expect(mockSetFamily).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({
    familyPendingQuestCount: 1,
    members: { kid: expect.objectContaining({ acceptedQuestCount: 1, pendingQuestCount: 1 }) },
  }));
  await act(() => jest.advanceTimersByTime(30_000));
  expect(mockSetFamily).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({ model: "player-cat", type: "npc", familyMemberId: "kid" }),
    expect.objectContaining({ houseOwnerId: "kid" }),
  ]), expect.anything());
  expect(mockSetFamily).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({
    familyPendingQuestCount: 1,
    members: { kid: expect.objectContaining({ acceptedQuestCount: 0, pendingQuestCount: 1 }) },
  }));
});
