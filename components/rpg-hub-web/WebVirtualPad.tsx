import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, View } from "react-native";
import { getJoystickMovement, getLocalTouchPosition } from "../../lib/rpg-hub/movement";
import type { Direction } from "../../lib/rpg-hub/bridge";

// 見た目と操作感は components/rpg-hub/VirtualPad.tsx（R3F 版）と揃える。
// 違いは移動の反映先だけで、こちらは playerStore を直接更新せず、
// 入力を意図として WebView へ渡す。位置の計算と保持は WebView 側のゲームループが行う。
const JOYSTICK_RADIUS = 42;
const MAX_STEP = 0.12;

/** 入力変化とみなす移動量のしきい値。わずかな揺れでブリッジを往復させないための間引き。 */
const INPUT_EPSILON = 0.005;

type Props = {
  children: ReactNode;
  /** 入力が変化したときに呼ばれる。停止時は direction が null。 */
  onInputChange: (x: number, z: number, direction: Direction | null) => void;
};

export function WebVirtualPad({ children, onInputChange }: Props) {
  const knobPosition = useRef(new Animated.ValueXY()).current;
  const padRef = useRef<View>(null);
  const gestureActiveRef = useRef(false);
  const lastSentRef = useRef<{ direction: Direction | null; x: number; z: number }>({
    direction: null,
    x: 0,
    z: 0,
  });
  const onInputChangeRef = useRef(onInputChange);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  onInputChangeRef.current = onInputChange;

  const sendInput = (x: number, z: number, direction: Direction | null) => {
    const last = lastSentRef.current;
    const unchanged =
      last.direction === direction &&
      Math.abs(last.x - x) < INPUT_EPSILON &&
      Math.abs(last.z - z) < INPUT_EPSILON;
    if (unchanged) return;
    lastSentRef.current = { direction, x, z };
    onInputChangeRef.current(x, z, direction);
  };

  const stopMoving = () => {
    gestureActiveRef.current = false;
    setOrigin(null);
    sendInput(0, 0, null);
    Animated.spring(knobPosition, {
      friction: 5,
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.hypot(gestureState.dx, gestureState.dy) >= 4,
        onPanResponderGrant: (event) => {
          gestureActiveRef.current = true;
          const { locationX, locationY, pageX, pageY } = event.nativeEvent;
          padRef.current?.measureInWindow((viewX, viewY) => {
            if (gestureActiveRef.current) {
              setOrigin(getLocalTouchPosition(pageX, pageY, viewX, viewY));
            }
          });
          if (!padRef.current) setOrigin({ x: locationX, y: locationY });
        },
        onPanResponderMove: (_, gestureState) => {
          const movement = getJoystickMovement(
            gestureState.dx,
            gestureState.dy,
            JOYSTICK_RADIUS,
            MAX_STEP,
          );
          knobPosition.setValue({ x: movement.knobX, y: movement.knobY });
          sendInput(movement.x, movement.z, movement.direction);
        },
        onPanResponderRelease: stopMoving,
        onPanResponderTerminate: stopMoving,
        onPanResponderTerminationRequest: () => false,
        onStartShouldSetPanResponder: () => false,
      }),
    [knobPosition],
  );

  useEffect(() => stopMoving, []);

  return (
    <View
      ref={padRef}
      accessibilityLabel="移動スティック。動かしたい方向へドラッグしてください"
      className="flex-1"
      {...panResponder.panHandlers}
    >
      {children}
      {origin && (
        <View
          className="absolute h-28 w-28 items-center justify-center rounded-full border-2 border-white/50 bg-slate-900/55"
          pointerEvents="none"
          style={{ left: origin.x - 56, top: origin.y - 56 }}
        >
          <View className="absolute h-1 w-16 rounded-full bg-white/25" />
          <View className="absolute h-16 w-1 rounded-full bg-white/25" />
          <Animated.View
            className="h-12 w-12 rounded-full border-2 border-white/80 bg-slate-700"
            style={{ transform: knobPosition.getTranslateTransform() }}
          />
        </View>
      )}
    </View>
  );
}
