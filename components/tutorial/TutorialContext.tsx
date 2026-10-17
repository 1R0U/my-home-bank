import { createContext, useContext } from "react";
import type { TutorialRole, TutorialStep } from "../../lib/tutorial";
import type { TutorialFeature } from "../../lib/tutorialFeatures";

export type TutorialContextValue = {
  role: TutorialRole;
  mode: "idle" | "offer" | "running";
  index: number;
  step: TutorialStep | null;
  storageError: boolean;
  feature?: TutorialFeature | null;
  label?: string;
  total?: number;
  home: (feature?: TutorialFeature, ready?: boolean) => void;
  start: (feature?: TutorialFeature) => void;
  stop: () => void;
  advance: (id: string) => void;
  retrySave: () => void;
};

export const TutorialContext = createContext<TutorialContextValue | null>(null);
export const useTutorial = () => useContext(TutorialContext);
