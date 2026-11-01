import { Linking } from 'react-native';
import { getEngine } from './db';
import { nav, type Route } from '../state/nav';
import { titleKey } from '../engine/links';

/**
 * Deep links: sofia://node/<title>, sofia://observer/<title>, sofia://autopilot,
 * sofia://graph. Used by Spotlight-style shortcuts and by the screenshot
 * pipeline to reach any screen deterministically.
 */
export function routeFromUrl(url: string): Route[] | null {
  const m = url.match(/^sofia:\/\/([a-z]+)\/?(.*)$/i);
  if (!m) return null;
  const e = getEngine();
  const target = m[2] ? e.resolve(titleKey(decodeURIComponent(m[2]))) : undefined;
  switch (m[1]) {
    case 'home':
      return [{ name: 'home' }];
    case 'node':
      return target ? [{ name: 'home' }, ...e.path(target.id).map((n) => ({ name: 'node' as const, id: n.id }))] : null;
    case 'observer':
      return target ? [{ name: 'home' }, { name: 'node', id: target.id }, { name: 'observer', id: target.id }] : null;
    case 'autopilot':
      return [{ name: 'home' }, { name: 'autopilot', scope: target?.id ?? null }];
    case 'graph':
      return [{ name: 'home' }, { name: 'graph', focus: target?.id }];
    case 'settings':
      return [{ name: 'home' }, { name: 'settings' }];
  }
  return null;
}

export function applyDevRoute(): void {
  const go = (url: string | null | undefined) => {
    if (!url) return;
    const r = routeFromUrl(url);
    if (__DEV__) console.log('[sofia] link', url, r ? r.map((x) => x.name).join('>') : 'unresolved');
    if (r) nav().reset(r);
  };
  Linking.getInitialURL().then(go).catch(() => {});
  Linking.addEventListener('url', (ev) => go(ev.url));
}
