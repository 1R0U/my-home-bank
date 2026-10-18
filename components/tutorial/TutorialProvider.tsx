import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { type TutorialRole } from "../../lib/tutorial";
import { FEATURE_TUTORIALS, featureStorageKey, getFeatureTutorial, getScreenTutorial, type TutorialFeature } from "../../lib/tutorialFeatures";
import { getTutorialNavigationPath } from "../../lib/tutorialOverlay";
import { TutorialContext, type TutorialContextValue, type TutorialTarget } from "./TutorialContext";

type Session = { mode: "running" | "idle"; index: number };
type State = {
  owner: string; loaded: boolean;
  seen: Partial<Record<TutorialFeature, boolean>>;
  sessions: Partial<Record<TutorialFeature, Session>>;
  errors: Partial<Record<TutorialFeature, boolean>>;
};
/** 利用者の切り替え時に、表示履歴の読込待ちから始める空の状態を作る。 */
const initialState = (owner: string): State => ({ owner, loaded: false, seen: {}, sessions: {}, errors: {} });

/** 表示履歴と、この起動中だけの進捗を機能ごとに保持する。画面本体は再マウントしない。 */
export default function TutorialProvider({ userId, role, children }: {
  userId: string | null; role: TutorialRole; children: ReactNode;
}) {
  const path = usePathname();
  const owner = `${role}:${userId ?? "signed-out"}`;
  const [state, setState] = useState(() => initialState(owner));
  const [readyScreens, setReadyScreens] = useState<Partial<Record<TutorialFeature, { owner: string; ready: boolean }>>>({});
  const [hubLocation, setHubLocation] = useState<{ owner: string; feature: "town" | "house" } | null>(null);
  const [skipSettings, setSkipSettings] = useState<string | null>(null);
  const current = state.owner === owner ? state : initialState(owner);
  const live = useRef({ owner, feature: null as TutorialFeature | null, path, stepId: null as string | null, mode: "idle" as "idle" | "offer" | "running" });
  const [measuredTarget, setMeasuredTarget] = useState<{ owner: string; value: TutorialTarget } | null>(null);
  const permittedNavigation = useRef<{ owner: string; path: string } | null>(null);
  const mounted = useRef(false);
  const saveVersions = useRef<Partial<Record<TutorialFeature, number>>>({});
  const generation = useRef(0);
  const errorsRef = useRef(current.errors);
  errorsRef.current = current.errors;

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    let cancelled = false;
    saveVersions.current = {};
    setState(initialState(owner));
    if (userId) {
      void Promise.all(FEATURE_TUTORIALS[role].map(async ({ id }) => {
        try { return [id, await AsyncStorage.getItem(featureStorageKey(userId, role, id)) === "seen"] as const; }
        catch { return [id, false] as const; }
      })).then((entries) => {
        if (cancelled) return;
        // 読込中の見直し・終了を、遅い読込結果で巻き戻さない。
        setState((previous) => previous.owner !== owner ? previous : {
          ...previous, loaded: true, seen: { ...Object.fromEntries(entries), ...previous.seen },
        });
      });
    }
    return () => { cancelled = true; mounted.current = false; };
  }, [owner, role, userId]);
  useEffect(() => { if (path !== "/settings-adult") setSkipSettings(null); }, [path]);
  useEffect(() => { permittedNavigation.current = null; }, [owner, path]);

  const hub = hubLocation?.owner === owner ? hubLocation.feature : "town";
  const screenFeature = getScreenTutorial(role, path, hub);
  let selected = screenFeature;
  // 初回の子供追加だけは、ホームから設定へ続ける。設定全体の案内を割り込ませない。
  if (path === "/settings-adult" && role === "parent") {
    for (const id of ["home", "family"] as const) {
      const session = current.sessions[id];
      const definition = getFeatureTutorial(role, id);
      const step = definition?.steps[session?.index ?? 0];
      if (session?.mode === "running" && (step?.path ?? step?.explanation?.path ?? definition.path) === path) {
        selected = id;
        break;
      }
    }
  }
  const definition = selected ? getFeatureTutorial(role, selected) : undefined;
  const session = selected ? current.sessions[selected] : undefined;
  const index = session?.index ?? 0;
  const candidate = definition?.steps[index];
  const needsReady = path === "/main-adult" || path === "/rpg-hub";
  const ready = !needsReady || (readyScreens[screenFeature]?.owner === owner && readyScreens[screenFeature]?.ready);
  const onStepScreen = candidate && (candidate.path ?? candidate.explanation?.path ?? definition.path) === path;
  const mode = !userId || !definition || !ready ? "idle"
    : session?.mode === "running" && onStepScreen ? "running"
    : !session && current.loaded && !current.seen[selected] && !(selected === "settings" && skipSettings === owner) ? "offer" : "idle";
  const storageError = Boolean(selected && current.errors[selected]);
  live.current = { owner, feature: selected, path, stepId: mode === "running" ? candidate?.id : null, mode };
  const target = mode === "running" && measuredTarget?.owner === owner && measuredTarget.value.id === candidate?.id ? measuredTarget.value : null;
  useEffect(() => {
    if (mode !== "running") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [mode]);

  /** 計測結果が変わったときだけ、現在の手順の対象を更新する。 */
  const registerTarget = useCallback((value: TutorialTarget) => {
    if (live.current.owner !== owner || live.current.stepId !== value.id) return;
    setMeasuredTarget((previous) => {
      const old = previous?.value;
      if (previous?.owner === owner && old?.id === value.id && old.activate === value.activate
        && old.rect?.x === value.rect?.x && old.rect?.y === value.rect?.y
        && old.rect?.width === value.rect?.width && old.rect?.height === value.rect?.height) return previous;
      return { owner, value };
    });
  }, [owner]);
  /** この利用者の指定対象だけを解除し、別の対象の計測結果は残す。 */
  const clearTarget = useCallback((id: string) => {
    setMeasuredTarget((previous) => previous?.owner === owner && previous.value.id === id ? null : previous);
  }, [owner]);
  /** 案内中は現在の対象だけを操作可能にし、案内終了後は制限を解除する。 */
  const canInteract = useCallback((id?: string) => live.current.mode !== "running" || Boolean(id && live.current.stepId === id), []);
  /** 案内自体が必要とする画面移動だけ、移動先を指定して許可する。 */
  const navigate = useCallback((destination: string, action: () => void) => {
    permittedNavigation.current = { owner, path: destination };
    action();
  }, [owner]);
  /** 案内中の離脱は、同じ利用者の案内が許可した移動先と一致するときだけ通す。 */
  const canNavigateAction = useCallback((action: any) => {
    if (live.current.mode !== "running") return true;
    return permittedNavigation.current?.owner === owner
      && permittedNavigation.current.path === getTutorialNavigationPath(action);
  }, [owner]);

  /** 一つの機能の表示済み履歴を保存し、その試行に対応する失敗だけを記録する。 */
  const saveSeen = useCallback((id: TutorialFeature) => {
    if (!userId) return;
    const version = (saveVersions.current[id] ?? 0) + 1;
    const savedGeneration = generation.current;
    saveVersions.current[id] = version;
    setState((previous) => ({ ...(previous.owner === owner ? previous : initialState(owner)),
      seen: { ...(previous.owner === owner ? previous.seen : {}), [id]: true },
      errors: { ...(previous.owner === owner ? previous.errors : {}), [id]: false },
    }));
    void AsyncStorage.setItem(featureStorageKey(userId, role, id), "seen").catch(() => {
      if (mounted.current && live.current.owner === owner && generation.current === savedGeneration && saveVersions.current[id] === version) {
        setState((previous) => ({ ...previous, errors: { ...previous.errors, [id]: true } }));
      }
    });
  }, [owner, role, userId]);

  /** 指定した機能、または現在表示中の機能の案内を最初から始める。 */
  const start = useCallback((id?: TutorialFeature) => {
    const target = id ?? live.current.feature;
    if (!userId || !target || !getFeatureTutorial(role, target)) return;
    setSkipSettings(null);
    saveSeen(target);
    setState((previous) => {
      const sessions = { ...previous.sessions };
      // 同じ設定画面で表示する案内を、明示した見直しに切り替える。未訪問の案内は閉じない。
      if (id) for (const related of ["home", "family"] as const) {
        if (sessions[related]?.mode === "running") sessions[related] = { mode: "idle", index: 0 };
      }
      sessions[target] = { mode: "running", index: 0 };
      return { ...previous, sessions };
    });
  }, [role, userId, saveSeen]);
  /** 現在の案内だけを閉じ、初回の子供追加直後は設定全体の割り込みを防ぐ。 */
  const stop = useCallback(() => {
    const id = live.current.feature;
    if (!id || !userId) return;
    if ((id === "home" || id === "family") && live.current.path === "/settings-adult") setSkipSettings(owner);
    saveSeen(id);
    setState((previous) => ({ ...previous, sessions: { ...previous.sessions, [id]: { mode: "idle", index: 0 } } }));
  }, [owner, userId, saveSeen]);
  /** 現在の画面で対象の操作が行われたときだけ、一つ先の手順へ進める。 */
  const advance = useCallback((id: string) => {
    const target = live.current.feature;
    const path = live.current.path;
    if (!target || live.current.owner !== owner || live.current.stepId !== id) return;
    setState((previous) => {
      const session = previous.sessions[target];
      const definition = getFeatureTutorial(role, target);
      const step = definition?.steps[session?.index];
      if (previous.owner !== owner || session?.mode !== "running" || step?.id !== id
        || (step.path ?? step.explanation?.path ?? definition.path) !== path) return previous;
      return { ...previous, sessions: { ...previous.sessions, [target]: {
        ...session, index: Math.min(session.index + 1, definition.steps.length - 1),
      } } };
    });
    // 子供追加まで実際に見たときだけ、独立した子供追加の案内も表示済みにする。
    if (role === "parent" && target === "home" && id === "parent-family-code") saveSeen("family");
  }, [owner, role, saveSeen]);
  /** 現在表示中の機能に保存失敗がある場合だけ、その履歴を再保存する。 */
  const retrySave = useCallback(() => {
    const id = live.current.feature;
    if (id && errorsRef.current[id]) saveSeen(id);
  }, [saveSeen]);
  /** ホームやハブの準備状態を登録し、町と家の現在地を案内の選択へ反映する。 */
  const home = useCallback((feature?: TutorialFeature, ready = true) => {
    const target = feature ?? (role === "parent" ? "home" : "town");
    setReadyScreens((previous) => ({ ...previous, [target]: { owner, ready } }));
    if (ready && (target === "town" || target === "house")) setHubLocation({ owner, feature: target });
  }, [owner, role]);
  const value = useMemo<TutorialContextValue>(() => ({
    role, mode, index, step: mode === "running" ? candidate : null, storageError,
    feature: selected, label: definition?.label, total: definition?.steps.length ?? 0,
    target, registerTarget, clearTarget, canInteract, navigate, canNavigateAction,
    home, start, stop, advance, retrySave,
  }), [role, mode, index, candidate, storageError, selected, definition, target, registerTarget, clearTarget, canInteract, navigate, canNavigateAction, home, start, stop, advance, retrySave]);

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}
