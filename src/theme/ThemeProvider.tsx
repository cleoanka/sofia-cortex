import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './tokens';
import { getEngine } from '../platform/db';

export type ThemePref = 'system' | 'light' | 'dark';

interface ThemeCtx {
  c: Palette;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx>({ c: light, pref: 'system', setPref: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>(() => (getEngine().meta('theme') as ThemePref) ?? 'system');
  const setPref = (p: ThemePref) => {
    getEngine().setMeta('theme', p);
    setPrefState(p);
  };
  const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo(() => ({ c: scheme === 'dark' ? dark : light, pref, setPref }), [scheme, pref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
export const usePalette = () => useContext(Ctx).c;
