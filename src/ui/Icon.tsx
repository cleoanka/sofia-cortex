import React, { memo } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Hand-drawn icon set on a 24 grid, 1.6 stroke, round caps. One visual voice;
 * no icon font, no raster, no dependency on a third-party glyph library.
 */
export type IconName =
  | 'back' | 'chevron' | 'plus' | 'lens' | 'tunnel' | 'graph' | 'search' | 'pin' | 'seal'
  | 'bell' | 'gear' | 'trash' | 'undo' | 'split' | 'check' | 'inbox' | 'close' | 'send'
  | 'sun' | 'moon' | 'auto' | 'teleport' | 'task' | 'note' | 'export' | 'import' | 'expand'
  | 'collapse' | 'link' | 'steep' | 'restore' | 'globe' | 'focus' | 'up' | 'down';

const P: Record<IconName, (c: string) => React.ReactNode> = {
  back: (c) => <Path d="M14.5 5.5 8 12l6.5 6.5" stroke={c} />,
  chevron: (c) => <Path d="m9.5 5.5 6.5 6.5-6.5 6.5" stroke={c} />,
  up: (c) => <Path d="M5.5 14.5 12 8l6.5 6.5" stroke={c} />,
  down: (c) => <Path d="M5.5 9.5 12 16l6.5-6.5" stroke={c} />,
  plus: (c) => <Path d="M12 5v14M5 12h14" stroke={c} />,
  lens: (c) => (
    <>
      <Circle cx="12" cy="12" r="7.5" stroke={c} />
      <Circle cx="12" cy="12" r="3" stroke={c} />
      <Path d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2" stroke={c} />
    </>
  ),
  tunnel: (c) => (
    <>
      <Circle cx="12" cy="12" r="8" stroke={c} opacity={0.35} />
      <Circle cx="12" cy="12" r="5" stroke={c} opacity={0.7} />
      <Circle cx="12" cy="12" r="1.8" fill={c} stroke="none" />
    </>
  ),
  graph: (c) => (
    <>
      <Path d="M7 7.5 12 12m0 0 5.5-3M12 12l-1 6" stroke={c} opacity={0.6} />
      <Circle cx="6.5" cy="7" r="2.2" stroke={c} />
      <Circle cx="18" cy="8.5" r="2.2" stroke={c} />
      <Circle cx="10.8" cy="18.5" r="2.2" stroke={c} />
      <Circle cx="12" cy="12" r="1.6" fill={c} stroke="none" />
    </>
  ),
  globe: (c) => (
    <>
      <Circle cx="12" cy="12" r="8" stroke={c} />
      <Path d="M4 12h16M12 4c2.4 2.2 3.6 4.9 3.6 8s-1.2 5.8-3.6 8c-2.4-2.2-3.6-4.9-3.6-8S9.6 6.2 12 4Z" stroke={c} />
    </>
  ),
  focus: (c) => (
    <>
      <Path d="M4.5 9V6.5a2 2 0 0 1 2-2H9M15 4.5h2.5a2 2 0 0 1 2 2V9M19.5 15v2.5a2 2 0 0 1-2 2H15M9 19.5H6.5a2 2 0 0 1-2-2V15" stroke={c} />
      <Circle cx="12" cy="12" r="2.2" stroke={c} />
    </>
  ),
  search: (c) => (
    <>
      <Circle cx="11" cy="11" r="6" stroke={c} />
      <Path d="m15.5 15.5 4 4" stroke={c} />
    </>
  ),
  pin: (c) => <Path d="M9 4.5h6l-1 5 3 3H7l3-3-1-5ZM12 12.5v7" stroke={c} />,
  seal: (c) => (
    <>
      <Path d="M12 3.8 14 5.6l2.6-.4.9 2.5 2.4 1.2-.6 2.6 1.4 2.3-2 1.7v2.7l-2.6.5L14.8 21 12 20l-2.8 1-1.3-2.3-2.6-.5v-2.7l-2-1.7 1.4-2.3-.6-2.6 2.4-1.2.9-2.5 2.6.4L12 3.8Z" stroke={c} />
      <Path d="m9.2 12.2 1.9 1.9 3.8-3.9" stroke={c} />
    </>
  ),
  bell: (c) => <Path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5ZM10 20.5h4" stroke={c} />,
  gear: (c) => (
    <>
      <Path d="M5 7.5h9M18 7.5h1M5 16.5h1M10 16.5h9" stroke={c} />
      <Circle cx="16" cy="7.5" r="2" stroke={c} />
      <Circle cx="8" cy="16.5" r="2" stroke={c} />
    </>
  ),
  trash: (c) => <Path d="M5 7h14M9.5 7V5h5v2M7 7l.8 12h8.4L17 7M10.3 10.5v5.5M13.7 10.5v5.5" stroke={c} />,
  undo: (c) => <Path d="M9 7.5 5 11.5l4 4M5.5 11.5H14a5 5 0 0 1 0 10h-2" stroke={c} />,
  restore: (c) => <Path d="M5 12a7 7 0 1 0 2.1-5M5 4.5V8h3.5" stroke={c} />,
  split: (c) => <Path d="M12 4v5m0 0-5.5 5.5V20M12 9l5.5 5.5V20" stroke={c} />,
  check: (c) => <Path d="m5.5 12.5 4 4 9-9" stroke={c} />,
  inbox: (c) => <Path d="M4.5 13.5 7 5.5h10l2.5 8M4.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-4.5M4.5 13.5h4l1.2 2h4.6l1.2-2h4" stroke={c} />,
  close: (c) => <Path d="m6.5 6.5 11 11m0-11-11 11" stroke={c} />,
  send: (c) => <Path d="M12 19V6m0 0-5.5 5.5M12 6l5.5 5.5" stroke={c} />,
  sun: (c) => (
    <>
      <Circle cx="12" cy="12" r="3.6" stroke={c} />
      <Path d="M12 3.5v1.8M12 18.7v1.8M3.5 12h1.8M18.7 12h1.8M6 6l1.3 1.3M16.7 16.7 18 18M6 18l1.3-1.3M16.7 7.3 18 6" stroke={c} />
    </>
  ),
  moon: (c) => <Path d="M18.5 14.5A7 7 0 0 1 9.5 5.5a7 7 0 1 0 9 9Z" stroke={c} />,
  auto: (c) => (
    <>
      <Circle cx="12" cy="12" r="7.5" stroke={c} />
      <Path d="M12 12 12 7.5M12 12l3 2" stroke={c} />
    </>
  ),
  teleport: (c) => <Path d="M5 12h10m0 0-3.5-3.5M15 12l-3.5 3.5M19 6v12" stroke={c} />,
  task: (c) => <Rect x="5" y="5" width="14" height="14" rx="4.5" stroke={c} />,
  note: (c) => <Path d="M6 7h12M6 11h12M6 15h7" stroke={c} />,
  export: (c) => <Path d="M12 14V4.5m0 0L8.5 8M12 4.5 15.5 8M6 12v6.5h12V12" stroke={c} />,
  import: (c) => <Path d="M12 4.5V14m0 0-3.5-3.5M12 14l3.5-3.5M6 12v6.5h12V12" stroke={c} />,
  expand: (c) => <Path d="M8 9.5 12 5.5l4 4M8 14.5l4 4 4-4" stroke={c} />,
  collapse: (c) => <Path d="M8 5.5l4 4 4-4M8 18.5l4-4 4 4" stroke={c} />,
  link: (c) => <Path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-.8.8M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l.8-.8" stroke={c} />,
  steep: (c) => (
    <>
      <Path d="M6 9.5h10v5a5 5 0 0 1-10 0v-5ZM16 11h1.5a2 2 0 0 1 0 4H16" stroke={c} />
      <Path d="M9 3.8c-.8 1 .8 1.7 0 2.8M12.5 3.8c-.8 1 .8 1.7 0 2.8" stroke={c} opacity={0.6} />
    </>
  ),
};

export const Icon = memo(function Icon({ name, size = 22, color, weight = 1.6 }: { name: IconName; size?: number; color: string; weight?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
      {P[name](color)}
    </Svg>
  );
});
