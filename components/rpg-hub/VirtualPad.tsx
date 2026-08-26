import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, View } from "react-native";
import { getJoystickMovement } from "../../lib/rpg-hub/movement";
import { usePlayerStore } from "../../store/playerStore";

const JOYSTICK_RADIUS = 42;
const MOVE_INTERVAL_MS = 50;
const MAX_STEP = 0.12;

export function VirtualPad({ children }: { children: ReactNode }) {
  const move = usePlayerStore((state) => state.move);
  const knobPosition = useRef(new Animated.ValueXY()).current;
  const movementRef = useRef(getJoystickMovement(0, 0, JOYSTICK_RADIUS, MAX_STEP));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  const stopMoving = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setOrigin(null);
    movementRef.current = getJoystickMovement(0, 0, JOYSTICK_RADIUS, MAX_STEP);
    Animated.spring(knobPosition, {
      friction: 5,
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
    }).start();
  };

  const startMoving = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      const movement = movementRef.current;
      if (movement.direction) move(movement.x, movement.z, movement.direction);
    }, MOVE_INTERVAL_MS);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.hypot(gestureState.dx, gestureState.dy) >= 4,
        onPanResponderGrant: (event) => {
          setOrigin({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY });
          startMoving();
        },
        onPanResponderMove: (_, gestureState) => {
          const movement = getJoystickMovement(
            gestureState.dx,
            gestureState.dy,
            JOYSTICK_RADIUS,
            MAX_STEP,
          );
          movementRef.current = movement;
          knobPosition.setValue({ x: movement.knobX, y: movement.knobY });
        },
        onPanResponderRelease: stopMoving,
        onPanResponderTerminate: stopMoving,
        onPanResponderTerminationRequest: () => false,
        onStartShouldSetPanResponder: () => false,
      }),
    [knobPosition, move],
  );

  useEffect(() => stopMoving, []);

  return (
    <View
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
