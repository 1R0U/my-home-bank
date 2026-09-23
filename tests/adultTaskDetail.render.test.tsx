import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockApproveQuestLog = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRejectQuestLog = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchPendingLogForQuest = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockEnsureDbUser = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../lib/taskService", () => ({
  approveQuestLog: (...args: unknown[]) => mockApproveQuestLog(...args),
  rejectQuestLog: (...args: unknown[]) => mockRejectQuestLog(...args),
  fetchPendingLogForQuest: (...args: unknown[]) => mockFetchPendingLogForQuest(...args),
}));
jest.mock("../lib/userService", () => ({
  ensureDbUser: (...args: unknown[]) => mockEnsureDbUser(...args),
}));

import AdultTaskDetail from "../components/tasks/AdultTaskDetail";
import { useAppStore } from "../store";

const mockParent = {
  id: "user-parent-1",
  name: "お父さん",
  role: "parent" as const,
  balance: 500,
  created_at: "2026-07-01T00:00:00Z",
};
const dbParent = {
  ...mockParent,
  id: "00000000-0000-4000-8000-000000000001",
  name: "ゲスト（大人）",
};
const quest = {
  assigned_to: null,
  category: "daily" as const,
  created_at: "2026-07-01T00:00:00Z",
  created_by: dbParent.id,
  description: "浴槽を洗う",
  id: "quest-1",
  reward_amount: 50,
  status: "pending" as const,
  title: "お風呂掃除",
};
const pendingLog = {
  approved_at: null,
  approved_by: null,
  completed_at: "2026-07-02T00:00:00Z",
  id: "log-1",
  quest_id: quest.id,
  status: "pending" as const,
  user_id: "00000000-0000-4000-8000-000000000002",
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: mockParent });
  mockEnsureDbUser.mockResolvedValue(dbParent);
  mockFetchPendingLogForQuest.mockResolvedValue(pendingLog);
  mockApproveQuestLog.mockResolvedValue(undefined);
  mockRejectQuestLog.mockResolvedValue(undefined);
});

function renderDetail() {
  render(
    <AdultTaskDetail
      approver={mockParent}
      canWrite
      isLive
      onActionComplete={jest.fn()}
      onClose={jest.fn()}
      quest={quest}
      showActions
    />,
  );
}

test("承認時にモックの親をDBユーザーへ解決し、成功後にストアを更新する", async () => {
  renderDetail();
  fireEvent.press(await screen.findByRole("button", { name: "承認" }));

  await waitFor(() => {
    expect(mockEnsureDbUser).toHaveBeenCalledWith(mockParent);
    expect(mockApproveQuestLog).toHaveBeenCalledWith(pendingLog.id, dbParent.id);
    expect(useAppStore.getState().user).toEqual(dbParent);
  });
});

test("却下に失敗したら理由を表示し、グローバルユーザーを切り替えない", async () => {
  mockRejectQuestLog.mockRejectedValue({ message: "却下を保存できません" });
  renderDetail();
  fireEvent.press(await screen.findByRole("button", { name: "却下" }));

  await waitFor(() => expect(screen.getByText("却下を保存できません")).toBeTruthy());
  expect(mockRejectQuestLog).toHaveBeenCalledWith(pendingLog.id, dbParent.id);
  expect(useAppStore.getState().user).toEqual(mockParent);
});
