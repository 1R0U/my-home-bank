import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";

// Issue #399: 取得フックの共通化。画面どうしで同じデータを共有し、重ねて取得しない

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const mockFetchQuests = jest.fn<(familyId: string) => Promise<unknown[]>>();
jest.mock("../lib/taskService", () => ({
  fetchQuests: (familyId: string) => mockFetchQuests(familyId),
}));

const mockFetchLoans = jest.fn<() => Promise<unknown[]>>();
const mockFetchLoanOffer = jest.fn<(userId: string) => Promise<unknown>>();
jest.mock("../lib/loanService", () => ({
  fetchLoanOffer: (userId: string) => mockFetchLoanOffer(userId),
  fetchLoans: () => mockFetchLoans(),
}));

import { useLoans } from "../lib/useLoans";
import { useQuests } from "../lib/useQuests";
import { useResource } from "../lib/useResource";

const child = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  family_id: "10000000-0000-4000-8000-000000000399",
  id: "11111111-1111-4111-8111-111111111399",
  name: "たろう",
  role: "child" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: child });
});

test("同じ家族のクエスト一覧を2つの画面で使っても、取得は1回だけ", async () => {
  mockFetchQuests.mockResolvedValue([{ id: "q1" }]);

  const home = renderHook(() => useQuests());
  const tasks = renderHook(() => useQuests());

  await waitFor(() => expect(home.result.current.quests).toEqual([{ id: "q1" }]));
  expect(tasks.result.current.quests).toEqual([{ id: "q1" }]);
  expect(mockFetchQuests).toHaveBeenCalledTimes(1);
});

test("片方の画面で取り直すと、もう片方の画面にも反映される", async () => {
  mockFetchQuests.mockResolvedValueOnce([{ id: "q1" }]).mockResolvedValueOnce([{ id: "q2" }]);

  const home = renderHook(() => useQuests());
  const tasks = renderHook(() => useQuests());
  await waitFor(() => expect(home.result.current.quests).toEqual([{ id: "q1" }]));

  await act(async () => {
    await tasks.result.current.reload();
  });

  expect(home.result.current.quests).toEqual([{ id: "q2" }]);
});

test("ローンはマウント時に1回だけ取得する（以前は useEffect とフォーカスで2回取っていた）", async () => {
  mockFetchLoans.mockResolvedValue([]);
  mockFetchLoanOffer.mockResolvedValue(null);

  const { result } = renderHook(() => useLoans());

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(mockFetchLoans).toHaveBeenCalledTimes(1);
  expect(mockFetchLoanOffer).toHaveBeenCalledWith(child.id);
});

test("キーが null のときは取得せず、プレビュー用の値を返す", () => {
  const fetcher = jest.fn<() => Promise<string>>();
  const { result } = renderHook(() =>
    useResource({ errorMessage: "失敗", fetcher, initialData: "空", key: null, preview: "モック" }),
  );

  expect(result.current).toMatchObject({ data: "モック", isLive: false, loading: false });
  expect(fetcher).not.toHaveBeenCalled();
});

test("取得できない理由があるときは取得せず、それをエラーとして返す", () => {
  const fetcher = jest.fn<() => Promise<string>>();
  const { result } = renderHook(() =>
    useResource({ blockedReason: "家族がいません", errorMessage: "失敗", fetcher, initialData: "空", key: ["x"] }),
  );

  expect(result.current).toMatchObject({ data: "空", error: "家族がいません", loading: false });
  expect(fetcher).not.toHaveBeenCalled();
});

test("キーが変わったら、取得が終わるまで前のキーのデータを見せない", async () => {
  let resolveSecond: (value: string) => void = () => undefined;
  const fetcher = jest
    .fn<() => Promise<string>>()
    .mockResolvedValueOnce("Aさんのデータ")
    .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)));

  const { result, rerender } = renderHook(
    ({ userId }: { userId: string }) =>
      useResource({ errorMessage: "失敗", fetcher, initialData: "空", key: ["x", userId] }),
    { initialProps: { userId: "a" } },
  );
  await waitFor(() => expect(result.current.data).toBe("Aさんのデータ"));

  rerender({ userId: "b" });
  expect(result.current.data).toBe("空");
  expect(result.current.loading).toBe(true);

  await act(async () => resolveSecond("Bさんのデータ"));
  expect(result.current.data).toBe("Bさんのデータ");
});

test("表示中にキャッシュが消されたら、フォーカスを待たずに取り直す", async () => {
  const { clearResourceCache } = require("../lib/resourceCache");
  mockFetchQuests.mockResolvedValueOnce([{ id: "q1" }]).mockResolvedValueOnce([{ id: "q2" }]);

  const { result } = renderHook(() => useQuests());
  await waitFor(() => expect(result.current.quests).toEqual([{ id: "q1" }]));

  act(() => clearResourceCache());

  await waitFor(() => expect(result.current.quests).toEqual([{ id: "q2" }]));
  expect(result.current.loading).toBe(false);
});

test("同じ家族の別の利用者に切り替わっても、家族のクエスト一覧は消えない", async () => {
  mockFetchQuests.mockResolvedValue([{ id: "q1" }]);
  const { result } = renderHook(() => useQuests());
  await waitFor(() => expect(result.current.quests).toEqual([{ id: "q1" }]));

  act(() => useAppStore.getState().setUser({ ...child, id: "22222222-2222-4222-8222-222222222399" }));

  expect(result.current.quests).toEqual([{ id: "q1" }]);
  expect(result.current.loading).toBe(false);
});
