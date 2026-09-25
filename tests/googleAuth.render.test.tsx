import { beforeEach, expect, jest, test } from "@jest/globals";

const mockCreateURL = jest.fn<(...args: unknown[]) => string>((path) => `my-home-bank://${path}`);
const mockOpenAuthSessionAsync = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("expo-linking", () => ({
  createURL: (...args: unknown[]) => mockCreateURL(...args),
}));
jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSessionAsync(...args),
}));

import { signInWithGoogle } from "../lib/googleAuth";

// lib/googleAuth.ts は plain Node（node --test）で読み込めない（expo-linking /
// expo-web-browser がネイティブ専用のため）。jest-expo のモックが効くよう、
// このファイルは .render.test.tsx にしてJest側で実行する（コンポーネントは描画しない）。

const userId = "00000000-0000-4000-8000-000000000042";
const familyId = "10000000-0000-4000-8000-000000000042";
const registeredProfile = {
  balance: 0,
  created_at: "2026-09-25T00:00:00Z",
  family_id: familyId,
  id: userId,
  name: "Google 太郎",
  role: "parent",
};

function createFakeClient({
  exchangeError = null,
  oauthError = null,
  oauthUrl = "https://accounts.google.com/o/oauth2/auth?...",
  profile = registeredProfile,
  sessionUser = { id: userId },
  signOut,
}: {
  exchangeError?: { code?: string; message?: string } | null;
  oauthError?: { code?: string; message?: string } | null;
  oauthUrl?: string | null;
  profile?: typeof registeredProfile | null;
  sessionUser?: { id: string } | null;
  signOut?: (...args: unknown[]) => Promise<{ error: null }>;
} = {}) {
  const signOutMock = signOut ?? jest.fn(async () => ({ error: null }));
  return {
    auth: {
      exchangeCodeForSession: jest.fn(async () =>
        exchangeError
          ? { data: { user: null }, error: exchangeError }
          : { data: { user: sessionUser }, error: null },
      ),
      signInWithOAuth: jest.fn(async () =>
        oauthError
          ? { data: { url: null }, error: oauthError }
          : { data: { url: oauthUrl }, error: null },
      ),
      signOut: signOutMock,
    },
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            profile ? { data: profile, error: null } : { data: null, error: { code: "PGRST116" } },
        }),
      }),
    })),
    rpc: jest.fn(async () => ({ data: familyId, error: null })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("成功時: OAuthを開始し、コードを交換してプロフィールを取得する", async () => {
  mockOpenAuthSessionAsync.mockResolvedValue({
    type: "success",
    url: "my-home-bank://auth/callback?code=abc123",
  });
  const client = createFakeClient();

  const result = await signInWithGoogle(client as any);

  expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
    options: { redirectTo: "my-home-bank://auth/callback", skipBrowserRedirect: true },
    provider: "google",
  });
  expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
    "https://accounts.google.com/o/oauth2/auth?...",
    "my-home-bank://auth/callback",
  );
  expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
  expect(result).toEqual({ data: registeredProfile, error: null });
});

test("OAuth開始に失敗したらエラーを返す", async () => {
  const client = createFakeClient({ oauthError: { message: "network error" } });

  const result = await signInWithGoogle(client as any);

  expect(result.data).toBeNull();
  expect(result.error).toBeTruthy();
  expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
});

test.each([["cancel"], ["dismiss"]])(
  "ブラウザが%sで閉じたらキャンセルのメッセージを返す",
  async (type) => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type });
    const client = createFakeClient();

    const result = await signInWithGoogle(client as any);

    expect(result).toEqual({ data: null, error: "ログインがキャンセルされました。" });
    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  },
);

test("成功以外の結果（失敗）は通信エラーのメッセージを返す", async () => {
  mockOpenAuthSessionAsync.mockResolvedValue({ type: "locked" });
  const client = createFakeClient();

  const result = await signInWithGoogle(client as any);

  expect(result).toEqual({
    data: null,
    error: "Google認証に失敗しました。通信環境を確認して再度お試しください。",
  });
});

test("戻り先URLにcodeが無ければエラーを返す", async () => {
  mockOpenAuthSessionAsync.mockResolvedValue({
    type: "success",
    url: "my-home-bank://auth/callback?error=access_denied",
  });
  const client = createFakeClient();

  const result = await signInWithGoogle(client as any);

  expect(result.data).toBeNull();
  expect(result.error).toBeTruthy();
  expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test("コード交換に失敗したらエラーを返す", async () => {
  mockOpenAuthSessionAsync.mockResolvedValue({
    type: "success",
    url: "my-home-bank://auth/callback?code=abc123",
  });
  const client = createFakeClient({ exchangeError: { message: "invalid code" } });

  const result = await signInWithGoogle(client as any);

  expect(result.data).toBeNull();
  expect(result.error).toBeTruthy();
});

test("プロフィールが見つからなければローカルセッションを破棄してエラーを返す", async () => {
  mockOpenAuthSessionAsync.mockResolvedValue({
    type: "success",
    url: "my-home-bank://auth/callback?code=abc123",
  });
  const signOutMock = jest.fn(async () => ({ error: null }));
  const client = createFakeClient({ profile: null, signOut: signOutMock });

  const result = await signInWithGoogle(client as any);

  expect(result.data).toBeNull();
  expect(result.error).toBe("ユーザー情報が見つかりません。再度登録してください。");
  expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
});
