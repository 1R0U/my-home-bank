import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { advanceTutorial, TUTORIAL_STEPS, tutorialStorageKey, type TutorialRole } from "../../lib/tutorial";
import { TutorialContext } from "./TutorialContext";

type State = { key: string; mode: "idle" | "offer" | "running"; index: number; seen: boolean | null; storageError: boolean };
const initialState = (key: string): State => ({ key, mode: "idle", index: 0, seen: null, storageError: false });

/** ナビゲーションを再マウントせず、案内の状態だけを利用者ごとに切り替える。 */
export default function TutorialProvider({ userId, role, children }: {
  userId: string | null; role: TutorialRole; children: ReactNode;
}) {
  const key = userId ? tutorialStorageKey(userId, role) : "signed-out";
  const [state, setState] = useState(() => initialState(key));
  const [homeKey, setHomeKey] = useState<string | null>(null);
  const activeKey = useRef(key);
  activeKey.current = key;
  const readVersion = useRef(0);
  const saveVersion = useRef(0);
  const mounted = useRef(false);
  // 切り替え直後の描画でも前の人の枠や文章を表示しない。
  const current = state.key === key ? state : initialState(key);
  const { mode, index, seen, storageError } = current;

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const version = ++readVersion.current;
    saveVersion.current += 1;
    setState(initialState(key));
    if (!userId) return () => { cancelled = true; mounted.current = false; };
    AsyncStorage.getItem(key).then((value) => {
      if (!cancelled && version === readVersion.current) setState((previous) => ({ ...previous, seen: value === "seen" }));
    }).catch(() => {
      // 読めないときも利用を妨げず、この起動中は案内を利用できるようにする。
      if (!cancelled && version === readVersion.current) setState((previous) => ({ ...previous, seen: false }));
    });
    return () => { cancelled = true; mounted.current = false; };
  }, [key, userId]);

  useEffect(() => {
    if (userId && homeKey === key && seen === false && mode === "idle") {
      setState((previous) => ({ ...previous, mode: "offer" }));
    }
  }, [homeKey, key, userId, seen, mode]);

  const saveSeen = useCallback(() => {
    if (!userId) return;
    readVersion.current += 1;
    const version = ++saveVersion.current;
    setState((previous) => ({ ...(previous.key === key ? previous : initialState(key)), seen: true, storageError: false }));
    void AsyncStorage.setItem(key, "seen").catch(() => {
      if (mounted.current && activeKey.current === key && saveVersion.current === version) {
        setState((previous) => ({ ...previous, storageError: true }));
      }
    });
  }, [key, userId]);

  const start = () => {
    if (!userId) return;
    saveSeen();
    setState((previous) => ({ ...previous, index: 0, mode: "running" }));
  };
  const home = useCallback(() => setHomeKey(key), [key]);

  return (
    <TutorialContext.Provider value={{
      role, mode, index, storageError,
      step: mode === "running" ? TUTORIAL_STEPS[role][index] : null,
      home,
      start,
      stop: () => { saveSeen(); setState((previous) => ({ ...previous, mode: "idle" })); },
      advance: (id) => setState((previous) => previous.key === key && previous.mode === "running"
        ? { ...previous, index: advanceTutorial(role, previous.index, id) } : previous),
      retrySave: saveSeen,
    }}>
      {children}
    </TutorialContext.Provider>
  );
}
