import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  type KeyboardEvent,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { useSceneDepth } from '../state/scene';
import { useBarInset } from './primitives';

/**
 * The keyboard's real height in points, straight from the system events.
 * iOS gets the "will" events so layout moves together with the keyboard.
 */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(() => (Keyboard.isVisible() ? (Keyboard.metrics()?.height ?? 0) : 0));
  useEffect(() => {
    // The frame's top edge is the truth: hidden = it sits at the bottom of the window.
    const fromFrame = (e: KeyboardEvent) => setH(Math.max(0, Dimensions.get('window').height - e.endCoordinates.screenY));
    const subs =
      Platform.OS === 'ios'
        ? [
            Keyboard.addListener('keyboardWillShow', fromFrame),
            Keyboard.addListener('keyboardWillChangeFrame', fromFrame),
            Keyboard.addListener('keyboardWillHide', () => setH(0)),
          ]
        : [Keyboard.addListener('keyboardDidShow', (e) => setH(e.endCoordinates.height)), Keyboard.addListener('keyboardDidHide', () => setH(0))];
    // An autoFocus input can raise the keyboard before this effect subscribed.
    if (Keyboard.isVisible()) setH(Keyboard.metrics()?.height ?? 0);
    return () => subs.forEach((x) => x.remove());
  }, []);
  return h;
}

type ScrollViewRef = React.ComponentRef<typeof ScrollView>;

// Fields announce "the caret may have moved" (focus, typing, new line); the
// scroll view on screen answers by measuring the focused input.
const listeners = new Set<() => void>();
export function nudgeCaret(): void {
  for (const l of listeners) l();
}

type Props = ScrollViewProps & {
  /** Free space kept between the focused input and the keyboard (accessory bars included). */
  margin?: number;
};

/**
 * A ScrollView that never lets the focused TextInput sit under the keyboard:
 * the content gets `keyboard + 100` of extra room, and whenever the keyboard
 * appears or a field reports a caret move, the focused input is measured in
 * window coordinates and scrolled up if its bottom passes the keyboard line.
 */
export const KeyboardScrollView = forwardRef<ScrollViewRef, Props>(function KeyboardScrollView(
  { margin = 90, contentContainerStyle, onScroll, children, ...rest },
  fwd,
) {
  const ref = useRef<ScrollViewRef>(null);
  useImperativeHandle(fwd, () => ref.current!);
  const kb = useKeyboardHeight();
  const kbRef = useRef(kb);
  kbRef.current = kb;
  const y = useRef(0);
  const depth = useSceneDepth();
  const queued = useRef(false);
  const again = useRef(false);
  const barInset = useBarInset();

  const ensureVisible = useCallback(() => {
    if (depth > 0) return;
    // A report arriving while one is pending (typing → wrap → size change) gets one more pass.
    if (queued.current) return void (again.current = true);
    queued.current = true;
    requestAnimationFrame(() => {
      queued.current = false;
      if (again.current) {
        again.current = false;
        setTimeout(ensureVisible, 16);
      }
      const input = TextInput.State.currentlyFocusedInput() as unknown as {
        measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
      } | null;
      const k = kbRef.current;
      if (!input?.measureInWindow || k <= 0) return;
      input.measureInWindow((_x, top, _w, h) => {
        const limit = Dimensions.get('window').height - k - margin;
        const bottom = top + h;
        // A field taller than the visible band (a long body) is left where the caret put it.
        if (bottom <= limit || h > limit - barInset) return;
        y.current += bottom - limit;
        ref.current?.scrollTo({ y: y.current, animated: true });
      });
    });
  }, [depth, margin]);

  useEffect(() => {
    listeners.add(ensureVisible);
    return () => void listeners.delete(ensureVisible);
  }, [ensureVisible]);

  // Once the extra room is laid out, bring the caret into view.
  useEffect(() => {
    if (kb > 0) setTimeout(ensureVisible, 30);
  }, [kb, ensureVisible]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    y.current = e.nativeEvent.contentOffset.y;
    onScroll?.(e);
  };

  return (
    <ScrollView
      ref={ref}
      {...rest}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      contentContainerStyle={[contentContainerStyle, kb > 0 && { paddingBottom: kb + 100 }]}
    >
      {children}
    </ScrollView>
  );
});
