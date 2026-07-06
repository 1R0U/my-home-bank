import { create } from "zustand";

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
