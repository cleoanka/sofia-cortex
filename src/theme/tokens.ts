/**
 * Design constitution. No raw #FFF / #000 anywhere in the app — every colour
 * comes from here. iOS system grouped colours: light is #F2F2F7 with white
 * inset cards, dark is true black with #1C1C1E cards; the accent is the warm
 * amber of Apple Notes. Observer keeps its own editorial paper.
 */

export type SchemeName = 'light' | 'dark';

export interface Palette {
  scheme: SchemeName;
  bg: string;
  bgSunk: string;
  surface: string;
  card: string;
  cardBorder: string;
  highlight: string; // specular top edge on raised surfaces
  hairline: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string; // indigo — structure, links, focus
  accentSoft: string;
  amber: string; // completion, warmth, the "done" glow
  amberSoft: string;
  /** Amber that passes 4.5:1 as text on the background. */
  amberInk: string;
  success: string;
  danger: string;
  shadow: string;
  scrim: string;
  link: string;
  tag: string;
  ring: string; // progress track
  // Inverse surface (the Focus card)
  invBg: string;
  invText: string;
  invDim: string;
  invAccent: string;
  onAmber: string;
  // Observer / dossier
  obsBg: string;
  obsPaper: string;
  obsInk: string;
  obsInkDim: string;
  obsRule: string;
  obsStamp: string;
  // Autopilot tunnel
  tunnelBg: string;
  tunnelGlow: string;
  // Marker highlights (Aa panel) and the iOS search-field fill
  hlYellow: string;
  hlGreen: string;
  hlBlue: string;
  hlPink: string;
  fill: string;
  /** The writing surface of a note (white / black, like Apple Notes). */
  paper: string;
  // Graph
  graphBg: string;
  graphNode: string;
  graphEdge: string;
  graphTag: string;
}

export const light: Palette = {
  scheme: 'light',
  bg: '#F2F2F7',
  bgSunk: '#E5E5EA',
  surface: '#E9E9EE',
  card: '#FFFFFF',
  cardBorder: '#E5E5EA',
  highlight: 'rgba(255,255,255,0.9)',
  hairline: '#DCDCE0',
  text: '#1C1C1E',
  textDim: '#8A8A8E',
  textFaint: '#AEAEB2',
  accent: '#E59A00',
  accentSoft: 'rgba(229,154,0,0.14)',
  amber: '#E59A00',
  amberSoft: 'rgba(229,154,0,0.14)',
  amberInk: '#A86F00',
  success: '#34C759',
  danger: '#FF3B30',
  shadow: 'rgba(0,0,0,0.08)',
  scrim: 'rgba(0,0,0,0.25)',
  link: '#A86F00',
  tag: '#8A8A8E',
  ring: '#E5E5EA',
  invBg: '#1A1A1D',
  invText: '#F7F5F0',
  invDim: '#A8A29E',
  invAccent: '#F2C27A',
  onAmber: '#FFFFFF',
  obsBg: '#F2F2F7',
  obsPaper: '#FFFFFF',
  obsInk: '#1C1C1E',
  obsInkDim: '#8A8A8E',
  obsRule: '#E5E5EA',
  obsStamp: '#A2341F',
  tunnelBg: '#F2F2F7',
  tunnelGlow: 'rgba(217,119,6,0.16)',
  hlYellow: 'rgba(255,214,10,0.38)',
  hlGreen: 'rgba(52,199,89,0.26)',
  hlBlue: 'rgba(10,132,255,0.20)',
  hlPink: 'rgba(255,55,95,0.20)',
  fill: 'rgba(118,118,128,0.12)',
  paper: '#FFFFFF',
  graphBg: '#F2F2F7',
  graphNode: '#3A3A3C',
  graphEdge: 'rgba(63,63,70,0.16)',
  graphTag: '#A86F00',
};

export const dark: Palette = {
  scheme: 'dark',
  bg: '#000000',
  bgSunk: '#000000',
  surface: '#2C2C2E',
  card: '#1C1C1E',
  cardBorder: '#2C2C2E',
  highlight: 'rgba(255,255,255,0.05)',
  hairline: '#38383A',
  text: '#FFFFFF',
  textDim: '#8D8D93',
  textFaint: '#636366',
  accent: '#F0A500',
  accentSoft: 'rgba(240,165,0,0.16)',
  amber: '#F0A500',
  amberSoft: 'rgba(240,165,0,0.16)',
  amberInk: '#F0A500',
  success: '#30D158',
  danger: '#FF453A',
  shadow: 'rgba(0,0,0,0.6)',
  scrim: 'rgba(0,0,0,0.6)',
  link: '#F0A500',
  tag: '#8D8D93',
  ring: '#38383A',
  invBg: '#1C1C1E',
  invText: '#F4F4F6',
  invDim: '#8E929F',
  invAccent: '#F2A33A',
  onAmber: '#1C1C1E',
  obsBg: '#000000',
  obsPaper: '#000000',
  obsInk: '#F2F2F7',
  obsInkDim: '#8D8D93',
  obsRule: '#38383A',
  obsStamp: '#E0654B',
  tunnelBg: '#000000',
  tunnelGlow: 'rgba(242,163,58,0.10)',
  hlYellow: 'rgba(255,214,10,0.30)',
  hlGreen: 'rgba(48,209,88,0.26)',
  hlBlue: 'rgba(10,132,255,0.30)',
  hlPink: 'rgba(255,55,95,0.28)',
  fill: 'rgba(118,118,128,0.24)',
  paper: '#000000',
  graphBg: '#000000',
  graphNode: '#C9CBD3',
  graphEdge: 'rgba(201,203,211,0.11)',
  graphTag: '#F0A500',
};

export const font = {
  serif: 'Newsreader_400Regular',
  serifItalic: 'Newsreader_400Regular_Italic',
  serifMedium: 'Newsreader_500Medium',
  serifSemi: 'Newsreader_600SemiBold',
  serifLightItalic: 'Newsreader_300Light_Italic',
} as const;

/** San Francisco (the iOS system font) by weight — the UI typeface. */
export const sf = {
  ui: { fontFamily: 'System', fontWeight: '400' },
  uiMedium: { fontFamily: 'System', fontWeight: '500' },
  uiSemi: { fontFamily: 'System', fontWeight: '600' },
  uiBold: { fontFamily: 'System', fontWeight: '700' },
} as const;

/** 4pt grid. */
export const space = { xxs: 2, xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { s: 8, m: 12, l: 18, xl: 26, pill: 999 } as const;

/** Spring presets — linear easing is unconstitutional. */
export const spring = {
  snappy: { damping: 22, stiffness: 320, mass: 0.7 },
  gentle: { damping: 20, stiffness: 160, mass: 1 },
  bouncy: { damping: 11, stiffness: 260, mass: 0.6 },
  portal: { damping: 26, stiffness: 230, mass: 0.9 },
  lens: { damping: 18, stiffness: 120, mass: 1.1 },
  melt: { damping: 30, stiffness: 140, mass: 1 },
} as const;

export const type = {
  largeTitle: { ...sf.uiBold, fontSize: 34, lineHeight: 41, letterSpacing: 0.37 },
  barTitle: { ...sf.uiSemi, fontSize: 17, lineHeight: 22, letterSpacing: -0.41 },
  noteTitle: { ...sf.uiBold, fontSize: 28, lineHeight: 34, letterSpacing: 0.36 },
  section: { ...sf.uiBold, fontSize: 20, lineHeight: 25, letterSpacing: 0.38 },
  body: { ...sf.ui, fontSize: 17, lineHeight: 24, letterSpacing: -0.41 },
  row: { ...sf.ui, fontSize: 17, lineHeight: 22, letterSpacing: -0.41 },
  preview: { ...sf.ui, fontSize: 15, lineHeight: 20, letterSpacing: -0.24 },
  small: { ...sf.ui, fontSize: 15, lineHeight: 20, letterSpacing: -0.24 },
  // Legacy aliases used by Graph/Settings.
  display: { ...sf.uiBold, fontSize: 30, lineHeight: 36, letterSpacing: 0.36 },
  title: { ...sf.uiSemi, fontSize: 22, lineHeight: 28, letterSpacing: 0.35 },
  headline: { ...sf.uiSemi, fontSize: 17, lineHeight: 22, letterSpacing: -0.41 },
  micro: { ...sf.uiMedium, fontSize: 12, lineHeight: 15, letterSpacing: 0 },
  mono: { ...sf.uiMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2, fontVariant: ['tabular-nums' as const] },
} as const;
