/**
 * Design constitution. No raw #FFF / #000 anywhere in the app — every colour
 * comes from here. Light is warm alabaster paper; dark is deep obsidian with a
 * specular 1px top highlight on raised surfaces. Observer derives a third
 * palette from either: deeper, editorial, higher contrast.
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
  // Graph
  graphBg: string;
  graphNode: string;
  graphEdge: string;
  graphTag: string;
}

export const light: Palette = {
  scheme: 'light',
  bg: '#FBF9F5',
  bgSunk: '#F3EFEA',
  surface: '#F3EFEA',
  card: '#FFFFFF',
  cardBorder: '#E6E1DA',
  highlight: 'rgba(255,255,255,0.9)',
  hairline: '#E9E4DD',
  text: '#18181B',
  textDim: '#71717A',
  textFaint: '#8C857E',
  accent: '#4F46E5',
  accentSoft: 'rgba(79,70,229,0.09)',
  amber: '#D97706',
  amberSoft: 'rgba(217,119,6,0.12)',
  amberInk: '#B45309',
  success: '#3F7D58',
  danger: '#B4443A',
  shadow: 'rgba(41,32,20,0.10)',
  scrim: 'rgba(24,20,16,0.28)',
  link: '#4338CA',
  tag: '#9A5B13',
  ring: '#E7E1D8',
  invBg: '#1A1A1D',
  invText: '#F7F5F0',
  invDim: '#A8A29E',
  invAccent: '#F2C27A',
  onAmber: '#1C1917',
  obsBg: '#EDE6DA',
  obsPaper: '#F7F2E8',
  obsInk: '#1C1A17',
  obsInkDim: '#6E655A',
  obsRule: '#CFC4B2',
  obsStamp: '#A2341F',
  tunnelBg: '#F1ECE4',
  tunnelGlow: 'rgba(217,119,6,0.16)',
  graphBg: '#F6F2EC',
  graphNode: '#3F3F46',
  graphEdge: 'rgba(63,63,70,0.16)',
  graphTag: '#B45309',
};

export const dark: Palette = {
  scheme: 'dark',
  bg: '#090A0C',
  bgSunk: '#060709',
  surface: '#111318',
  card: '#181B22',
  cardBorder: 'rgba(255,255,255,0.06)',
  highlight: 'rgba(255,255,255,0.07)',
  hairline: 'rgba(255,255,255,0.06)',
  text: '#F4F4F6',
  textDim: '#8E929F',
  textFaint: '#6E7280',
  accent: '#8B85FF',
  accentSoft: 'rgba(139,133,255,0.12)',
  amber: '#F2A33A',
  amberSoft: 'rgba(242,163,58,0.13)',
  amberInk: '#F2A33A',
  success: '#7BC496',
  danger: '#E5796E',
  shadow: 'rgba(0,0,0,0.55)',
  scrim: 'rgba(0,0,0,0.55)',
  link: '#A5A0FF',
  tag: '#E8B36A',
  ring: 'rgba(255,255,255,0.09)',
  invBg: '#181B22',
  invText: '#F4F4F6',
  invDim: '#8E929F',
  invAccent: '#F2A33A',
  onAmber: '#090A0C',
  obsBg: '#050506',
  obsPaper: '#0E0E10',
  obsInk: '#ECE6DA',
  obsInkDim: '#8F877A',
  obsRule: 'rgba(236,230,218,0.16)',
  obsStamp: '#E0654B',
  tunnelBg: '#040405',
  tunnelGlow: 'rgba(242,163,58,0.10)',
  graphBg: '#07080A',
  graphNode: '#C9CBD3',
  graphEdge: 'rgba(201,203,211,0.11)',
  graphTag: '#E8B36A',
};

export const font = {
  ui: 'Inter_400Regular',
  uiMedium: 'Inter_500Medium',
  uiSemi: 'Inter_600SemiBold',
  uiBold: 'Inter_700Bold',
  serif: 'Newsreader_400Regular',
  serifItalic: 'Newsreader_400Regular_Italic',
  serifMedium: 'Newsreader_500Medium',
  serifSemi: 'Newsreader_600SemiBold',
  serifLightItalic: 'Newsreader_300Light_Italic',
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
  display: { fontFamily: font.uiSemi, fontSize: 30, lineHeight: 36, letterSpacing: -0.9 },
  title: { fontFamily: font.uiSemi, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  headline: { fontFamily: font.uiSemi, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: font.ui, fontSize: 16, lineHeight: 24, letterSpacing: -0.15 },
  row: { fontFamily: font.ui, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  small: { fontFamily: font.ui, fontSize: 13, lineHeight: 18, letterSpacing: -0.05 },
  micro: { fontFamily: font.uiMedium, fontSize: 11, lineHeight: 14, letterSpacing: 0.6 },
  mono: { fontFamily: font.uiMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2, fontVariant: ['tabular-nums' as const] },
} as const;
