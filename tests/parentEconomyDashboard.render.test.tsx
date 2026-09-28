import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: (...args: unknown[]) => mockBack(...args), push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

let mockUser: any;
let mockCanUseRealData = true;
jest.mock("../store", () => ({
  useCurrentUser: () => mockUser,
  useDataAccess: () => ({ canUseRealData: mockCanUseRealData, isLoggedIn: mockCanUseRealData }),
}));

const now = new Date().toISOString();
const dashboard = {
  treasury: {
    id: "treasury-1", family_id: "family-1", balance: 110, initial_supply: 1000,
    total_supply: 1000, minimum_reserve_rate: 0.1, created_at: now, updated_at: now,
  },
  transactions: [
    {
      id: "reward-1", family_id: "family-1", actor_user_id: "parent-1", type: "quest_reward",
      from_account_type: "treasury", from_user_id: null, to_account_type: "wallet", to_user_id: "child-1",
      amount: 30, description: "お手伝い報酬", related_type: null, related_id: null, idempotency_key: "reward", created_at: now,
    },
    {
      id: "purchase-1", family_id: "family-1", actor_user_id: "child-1", type: "store_purchase",
      from_account_type: "wallet", from_user_id: "child-1", to_account_type: "treasury", to_user_id: null,
      amount: 20, description: "おやつ購入", related_type: null, related_id: null, idempotency_key: "purchase", created_at: now,
    },
  ],
  hasMoreTransactions: false,
  monthlyFlow: { inflow: 20, outflow: 30 },
  loans: [{
    id: "loan-1", family_id: "family-1", borrower_id: "child-1", requested_amount: 100,
    purpose: "本", status: "pending", monthly_interest_rate: 0.05, term_days: 30,
    principal_amount: null, interest_amount: null, principal_repaid: 0, interest_repaid: 0,
    request_idempotency_key: "loan", approved_by: null, requested_at: now, approved_at: null,
    rejected_at: null, due_at: null, completed_at: null, updated_at: now,
  }],
  borrowers: [{
    id: "child-1", name: "たろう",
    offer: { loan_limit: 500, monthly_interest_rate: 0.05, term_days: 30, outstanding_principal: 0, treasury_available: 10, available_amount: 10, has_overdue: false },
  }],
  savings: {
    transfer_day: 15,
    monthly_rate: 0.01,
    accounts: [{ user_id: "child-1", name: "たろう", balance: 200, monthly_amount: 50, next_transfer_date: "2026-10-15", estimated_interest: 2, history: [] }],
  },
  price: {
    current: { snapshot_month: "2026-09-01", avg_circulating_gol: 500, target_gol: 1000, price_index: 105, calculation_basis: {} },
    previous: { snapshot_month: "2026-08-01", avg_circulating_gol: 450, target_gol: 1000, price_index: 100, calculation_basis: {} },
    next_update_date: "2026-10-01",
  },
  pendingRewardTotal: 30,
};

const mockFetchDashboard = jest.fn<(...args: unknown[]) => Promise<any>>(() => Promise.resolve(dashboard));
const mockIssueTreasuryGol = jest.fn<(...args: unknown[]) => Promise<any>>(() => Promise.resolve(dashboard.treasury));
const mockFetchTransactionPage = jest.fn<(...args: unknown[]) => Promise<any>>(() => Promise.resolve({ transactions: [], hasMore: false }));
jest.mock("../lib/economyDashboardService", () => ({
  fetchEconomyDashboard: (...args: unknown[]) => mockFetchDashboard(...args),
}));
jest.mock("../lib/treasuryService", () => ({
  fetchEconomyTransactionPage: (...args: unknown[]) => mockFetchTransactionPage(...args),
  issueTreasuryGol: (...args: unknown[]) => mockIssueTreasuryGol(...args),
}));

import ParentEconomyDashboard from "../components/ParentEconomyDashboard";

beforeEach(() => {
  jest.clearAllMocks();
  mockCanUseRealData = true;
  mockUser = { id: "parent-1", family_id: "family-1", name: "親", role: "parent", balance: 0, created_at: now };
  mockFetchDashboard.mockResolvedValue(dashboard);
  mockIssueTreasuryGol.mockResolvedValue(dashboard.treasury);
  mockFetchTransactionPage.mockResolvedValue({ transactions: [], hasMore: false });
});

test("親が金庫・物価・ローン・積立と最低準備金警告を確認できる", async () => {
  render(<ParentEconomyDashboard />);
  expect(await screen.findByText("現在残高")).toBeTruthy();
  expect(screen.getByText("110 gol")).toBeTruthy();
  expect(screen.getByText("105（軽いインフレ）")).toBeTruthy();
  expect(screen.getByText("承認待ち")).toBeTruthy();
  expect(screen.getByText("毎月15日")).toBeTruthy();
  expect(screen.getByText(/最低準備金に近づいています/)).toBeTruthy();
});

test("経済ログを種別で絞り込み、詳細管理画面へ移動できる", async () => {
  render(<ParentEconomyDashboard />);
  await screen.findByText("お手伝い報酬");
  fireEvent.press(screen.getByRole("button", { name: "購入" }));
  expect(screen.queryByText("お手伝い報酬")).toBeNull();
  expect(screen.getByText("おやつ購入")).toBeTruthy();
  fireEvent.press(screen.getByText("申請・契約・設定を管理"));
  expect(mockPush).toHaveBeenCalledWith("/loan-management");
  fireEvent.press(screen.getByText("積立日を管理"));
  expect(mockPush).toHaveBeenCalledWith("/savings");
});

test("追加発行は確認後に一度だけ送信する", async () => {
  let finish: (value: any) => void = () => undefined;
  mockIssueTreasuryGol.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<ParentEconomyDashboard />);
  await screen.findByText("現在残高");
  fireEvent.changeText(screen.getByLabelText("追加発行額"), "50");
  fireEvent.press(screen.getByText("内容を確認"));
  expect(screen.getByText("50 golを追加発行しますか？")).toBeTruthy();
  const confirm = screen.getByLabelText("追加発行を確定");
  fireEvent.press(confirm);
  fireEvent.press(confirm);
  expect(mockIssueTreasuryGol).toHaveBeenCalledTimes(1);
  finish(dashboard.treasury);
  await waitFor(() => expect(screen.getByText("50 golを追加発行しました")).toBeTruthy());
});

test("取得失敗時に再試行できる", async () => {
  mockFetchDashboard.mockRejectedValueOnce(new Error("network"));
  render(<ParentEconomyDashboard />);
  expect(await screen.findByText(/家庭内経済の情報を取得できませんでした/)).toBeTruthy();
  fireEvent.press(screen.getByText("再試行"));
  expect(await screen.findByText("現在残高")).toBeTruthy();
  expect(mockFetchDashboard).toHaveBeenCalledTimes(2);
});

test("子どもロールには管理内容を表示しない", () => {
  mockUser = { ...mockUser, id: "child-1", role: "child" };
  render(<ParentEconomyDashboard />);
  expect(screen.getByText("経済管理は親のみ利用できます")).toBeTruthy();
  expect(screen.queryByText("ギルド金庫")).toBeNull();
  expect(mockFetchDashboard).not.toHaveBeenCalled();
});

test("親が実行した報酬でも受取先の子ども名を表示する", async () => {
  const namedDashboard = {
    ...dashboard,
    borrowers: dashboard.borrowers.map((borrower) => ({ ...borrower, name: "Hanako" })),
  };
  mockFetchDashboard.mockResolvedValue(namedDashboard);
  render(<ParentEconomyDashboard />);
  expect(await screen.findAllByText(`Hanako ／ ${new Date(now).toLocaleDateString("ja-JP")}`)).toHaveLength(2);
});

test("経済ログを100件単位で追加取得できる", async () => {
  const pagedDashboard = { ...dashboard, hasMoreTransactions: true };
  const additional = {
    ...dashboard.transactions[0],
    id: "reward-2",
    description: "追加の報酬",
  };
  mockFetchDashboard.mockResolvedValue(pagedDashboard);
  mockFetchTransactionPage.mockResolvedValue({ transactions: [additional], hasMore: false });
  render(<ParentEconomyDashboard />);
  await screen.findByText("さらに読み込む");
  fireEvent.press(screen.getByText("さらに読み込む"));
  expect(await screen.findByText("追加の報酬")).toBeTruthy();
  expect(mockFetchTransactionPage).toHaveBeenCalledWith("family-1", 2);
  expect(screen.queryByText("さらに読み込む")).toBeNull();
});
