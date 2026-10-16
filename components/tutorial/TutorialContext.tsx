import { createContext, useContext } from "react";
import type { TutorialRole, TutorialStep } from "../../lib/tutorial";

export type TutorialContextValue = {
  role: TutorialRole;
  mode: "idle" | "offer" | "running";
  index: number;
  step: TutorialStep | null;
  storageError: boolean;
  home: () => void;
  start: () => void;
  stop: () => void;
  advance: (id: string) => void;
  retrySave: () => void;
};

export const TutorialContext = createContext<TutorialContextValue | null>(null);
export const useTutorial = () => useContext(TutorialContext);
