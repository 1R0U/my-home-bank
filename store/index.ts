import { create } from "zustand";
import { DEV_ROLE_OVERRIDE } from "../lib/devRole";

type User = {
  id: string;
  name: string;
  role: "parent" | "child";
  balance: number;
};

type AppStore = {
  user: User | null;
  setUser: (user: User | null) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

/** 画面分岐に使う実効ロール。開発用の DEV_ROLE_OVERRIDE があればそちらを優先する。 */
export function useActiveRole(): "parent" | "child" | undefined {
  const role = useAppStore((s) => s.user?.role);
  return DEV_ROLE_OVERRIDE ?? role;
}
