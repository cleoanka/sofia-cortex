import React, { memo, useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming, Easing } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useNav, type Keyed } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { SceneDepth } from '../state/scene';
import { spring } from '../theme/tokens';

type Transition = 'portal' | 'flip' | 'tunnel' | 'rise';

const transitionOf = (r: Keyed): Transition =>
  r.name === 'observer' ? 'flip' : r.name === 'autopilot' ? 'tunnel' : r.name === 'settings' || r.name === 'trash' ? 'rise' : 'portal';

/**
 * A zoom-portal stack. Entering a node is "falling into" it: the new page
 * grows out of the old one while the old page recedes and dims. Every screen
 * stays mounted (scroll position, editor state survive) but only the top two
 * are composited. Edge-swipe pops with the finger, spring-settled.
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
  const kind = transitionOf(route);
  // enter: 0 → 1 on mount. behind: 0 (top) → 1 (covered).
  const enter = useSharedValue(isRoot ? 1 : 0);
  const behind = useSharedValue(0);
  const drag = useSharedValue(0);
  const pop = useNav((s) => s.pop);

  useEffect(() => {
    if (kind === 'tunnel') enter.value = withTiming(1, { duration: 520, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
    else enter.value = withSpring(1, kind === 'flip' ? spring.lens : spring.portal);
  }, []);
  useEffect(() => {
    behind.value = withSpring(depth > 0 ? 1 : 0, spring.portal);
  }, [depth]);

  const style = useAnimatedStyle(() => {
    const e = enter.value;
    const b = behind.value;
    const d = drag.value / width;
    if (kind === 'flip') {
      return {
        opacity: interpolate(e, [0, 0.45, 1], [0, 0.2, 1], Extrapolation.CLAMP),
        transform: [
          { perspective: 1200 },
          { translateX: drag.value },
          { rotateY: `${interpolate(e, [0, 1], [-78, 0])}deg` },
          { scale: interpolate(e, [0, 1], [0.9, 1]) * interpolate(b, [0, 1], [1, 0.94]) },
        ],
      };
    }
    if (kind === 'tunnel') {
      return {
        opacity: e * (1 - d),
        transform: [{ scale: interpolate(e, [0, 1], [1.08, 1]) }, { translateX: drag.value }],
      };
    }
    if (kind === 'rise') {
      return {
        opacity: interpolate(e, [0, 0.4], [0, 1], Extrapolation.CLAMP),
        transform: [{ translateY: interpolate(e, [0, 1], [60, 0]) }, { translateX: drag.value }, { scale: interpolate(b, [0, 1], [1, 0.95]) }],
      };
    }
    return {
      // Covered pages stay visible (dimmed by the scrim) so an edge-swipe reveals them.
      opacity: interpolate(e, [0, 0.5], [0, 1], Extrapolation.CLAMP),
      borderRadius: interpolate(b, [0, 1], [0, 28]) + interpolate(d, [0, 1], [0, 28], Extrapolation.CLAMP),
      transform: [
        { translateX: drag.value },
        { scale: interpolate(e, [0, 1], [0.9, 1]) * interpolate(b, [0, 1], [1, 0.94]) * interpolate(d, [0, 1], [1, 0.96], Extrapolation.CLAMP) },
      ],
    };
  });

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
      if (e.canceled) {
        drag.value = withSpring(0, spring.snappy);
        return;
      }
      if (e.translationX > width * 0.32 || e.velocityX > 700) {
        drag.value = withSpring(width, { ...spring.snappy, velocity: e.velocityX }, () => scheduleOnRN(pop));
      } else drag.value = withSpring(0, spring.snappy);
    },
  });

  const dim = useAnimatedStyle(() => ({ opacity: behind.value * 0.55 }));
  const hidden = depth > 1;
  return (
    <Animated.View
      pointerEvents={depth === 0 ? 'auto' : 'none'}
      exiting={exitFor(kind, drag)}
      style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, overflow: 'hidden' }, style, hidden && { display: 'none' }]}
    >
      <SceneDepth.Provider value={depth}>{children}</SceneDepth.Provider>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, dim]} />
      {!isRoot ? (
        <GestureDetector gesture={back}>
          <View style={styles.edge} />
        </GestureDetector>
      ) : null}
    </Animated.View>
  );
});

/** Exit choreography mirrors the entrance: portals shrink back into their row, lenses turn away. */
function exitFor(kind: Transition, drag: { value: number }) {
  return () => {
    'worklet';
    // Already swiped off-screen by the finger: leave without a second, ghostly exit.
    if (drag.value > 0) return { initialValues: { opacity: 0 }, animations: {} };
    const t = { duration: 240, easing: Easing.bezier(0.3, 0, 0.2, 1) };
    if (kind === 'flip')
      return {
        initialValues: { opacity: 1, transform: [{ perspective: 1200 }, { rotateY: '0deg' }] },
        animations: { opacity: withTiming(0, t), transform: [{ perspective: 1200 }, { rotateY: withTiming('70deg', t) }] },
      };
    if (kind === 'rise')
      return { initialValues: { opacity: 1, transform: [{ translateY: 0 }] }, animations: { opacity: withTiming(0, t), transform: [{ translateY: withSpring(80, spring.snappy) }] } };
    return {
      initialValues: { opacity: 1, transform: [{ scale: 1 }] },
      animations: { opacity: withTiming(0, t), transform: [{ scale: withSpring(0.9, spring.snappy) }] },
    };
  };
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 22 },
});
