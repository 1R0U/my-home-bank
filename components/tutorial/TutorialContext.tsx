import { createContext, useContext } from "react";
import type { TutorialRole, TutorialStep } from "../../lib/tutorial";
import type { TutorialFeature } from "../../lib/tutorialFeatures";
import type { TutorialRect } from "../../lib/tutorialOverlay";

export type TutorialTarget = { id: string; rect: TutorialRect | null; activate?: (event: any) => void };

export type TutorialContextValue = {
  role: TutorialRole;
  mode: "idle" | "offer" | "running";
  index: number;
  step: TutorialStep | null;
  storageError: boolean;
  feature?: TutorialFeature | null;
  label?: string;
  total?: number;
  target?: TutorialTarget | null;
  registerTarget?: (target: TutorialTarget) => void;
  clearTarget?: (id: string) => void;
  canInteract?: (id?: string) => boolean;
  navigate?: (path: string, action: () => void) => void;
  canNavigateAction?: (action: any) => boolean;
  home: (feature?: TutorialFeature, ready?: boolean) => void;
  start: (feature?: TutorialFeature) => void;
  stop: () => void;
  advance: (id: string) => void;
  retrySave: () => void;
};

export const TutorialContext = createContext<TutorialContextValue | null>(null);
/** 現在の利用者の案内状態を取得する。プロバイダーの外では案内を無効にする。 */
export const useTutorial = () => useContext(TutorialContext);
