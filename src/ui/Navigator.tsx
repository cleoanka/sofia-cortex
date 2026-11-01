import React, { memo, useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming, Extrapolation } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useNav, type Keyed } from '../state/nav';
import { SceneDepth } from '../state/scene';
import { usePalette } from '../theme/ThemeProvider';
import { ease, t200 } from '../theme/motion';

/** Reading view and Autopilot fade in place; everything else slides a little from the right. */
const fades = (r: Keyed) => r.name === 'observer' || r.name === 'autopilot';

/**
 * Navigation stack. Every screen stays mounted (scroll and editor state
 * survive) but only the top two are composited. Edge-swipe pops with the finger.
 */
export function Navigator({ render }: { render: (r: Keyed) => React.ReactNode }) {
  const stack = useNav((s) => s.stack);
  const c = usePalette();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
      {stack.map((r, i) => (
        <Scene key={r.key} route={r} depth={stack.length - 1 - i} isRoot={i === 0}>
          {render(r)}
        </Scene>
      ))}
    </View>
  );
}

const Scene = memo(function Scene({ route, depth, isRoot, children }: { route: Keyed; depth: number; isRoot: boolean; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const c = usePalette();
  const fade = fades(route);
  const enter = useSharedValue(isRoot ? 1 : 0);
  const drag = useSharedValue(0);
  const pop = useNav((s) => s.pop);

  useEffect(() => {
    enter.value = withTiming(1, t200);
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: fade ? enter.value : interpolate(enter.value, [0, 0.6], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: (fade ? 0 : (1 - enter.value) * 28) + drag.value }],
  }));

  const back = usePanGesture({
    enabled: !isRoot && depth === 0,
    activeOffsetX: 12,
    failOffsetY: [-14, 14],
    onUpdate: (e) => {
      'worklet';
      drag.value = Math.max(0, e.translationX);
    },
    onDeactivate: (e) => {
      'worklet';
      if (!e.canceled && (e.translationX > width * 0.32 || e.velocityX > 700)) {
        drag.value = withTiming(width, { duration: 180, easing: ease }, (fin) => {
          if (fin) scheduleOnRN(pop);
        });
      } else drag.value = withTiming(0, t200);
    },
  });

  return (
    <Animated.View
      pointerEvents={depth === 0 ? 'auto' : 'none'}
      exiting={exitFor(fade, drag)}
      style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }, style, depth > 1 && { display: 'none' }]}
    >
      <SceneDepth.Provider value={depth}>{children}</SceneDepth.Provider>
      {!isRoot ? (
        <GestureDetector gesture={back}>
          <View style={styles.edge} />
        </GestureDetector>
      ) : null}
    </Animated.View>
  );
});

function exitFor(fade: boolean, drag: { value: number }) {
  return () => {
    'worklet';
    // Already swiped away by the finger: leave without a second exit.
    if (drag.value > 0) return { initialValues: { opacity: 0 }, animations: {} };
    const t = { duration: 160, easing: ease };
    return {
      initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
      animations: { opacity: withTiming(0, t), transform: [{ translateX: withTiming(fade ? 0 : 28, t) }] },
    };
  };
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 20 },
});
