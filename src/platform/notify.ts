import * as Notifications from 'expo-notifications';
import type { NodeId } from '../engine/types';
import { getEngine } from './db';
import { nav, type Route } from '../state/nav';

/**
 * Chrono-triggers. A normal reminder opens the node; an Autopilot Hook opens
 * straight into the single-task tunnel for that node — Home is never shown,
 * there is nothing to decide. A steeped Observer note re-opens as its case file.
 */
type Payload = { nodeId: NodeId; mode: 'node' | 'autopilot' | 'observer' };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function ensurePermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const next = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return next.granted;
}

async function schedule(at: number, title: string, body: string, data: Payload): Promise<string | null> {
  if (!(await ensurePermission())) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
  });
}

export async function setReminder(id: NodeId, at: number | null, hook: string | null): Promise<void> {
  const e = getEngine();
  const n = e.get(id);
  if (!n) return;
  if (n.reminderId) await Notifications.cancelScheduledNotificationAsync(n.reminderId).catch(() => {});
  if (at == null) {
    e.update(id, { reminderAt: null, reminderHook: null, reminderId: null });
    return;
  }
  if (at <= Date.now()) return;
  const title = hook ? `▶ ${hook}` : n.title || 'Sofia Cortex';
  const body = hook ? `Otopilot hazır · ${n.title}` : e.path(id).slice(0, -1).map((p) => p.title).join(' › ') || 'Hatırlatma';
  const rid = await schedule(at, title, body, { nodeId: id, mode: hook ? 'autopilot' : 'node' });
  e.update(id, { reminderAt: at, reminderHook: hook, reminderId: rid });
}

export async function scheduleSteep(id: NodeId, title: string, at: number): Promise<void> {
  await cancelSteep(id);
  const rid = await schedule(at, 'Vaka dosyası hazır', `“${title}” demlendi. Şimdi dışarıdan bak.`, { nodeId: id, mode: 'observer' });
  if (rid) getEngine().setMeta(`steep:${id}`, rid);
}

export async function cancelSteep(id: NodeId): Promise<void> {
  const e = getEngine();
  const rid = e.meta(`steep:${id}`);
  if (!rid) return;
  e.setMeta(`steep:${id}`, '');
  await Notifications.cancelScheduledNotificationAsync(rid).catch(() => {});
}

/** A deleted subtree must not keep ringing. */
export function cancelTriggers(ids: NodeId[]): void {
  const e = getEngine();
  for (const id of ids) {
    const n = e.get(id);
    if (n?.reminderId) Notifications.cancelScheduledNotificationAsync(n.reminderId).catch(() => {});
    cancelSteep(id);
  }
}

function routeFor(p: Payload): Route[] {
  const e = getEngine();
  if (!e.get(p.nodeId)) return [{ name: 'home' }];
  if (p.mode === 'observer') {
    e.update(p.nodeId, { steepUntil: null }, { history: false });
    return [{ name: 'home' }, { name: 'node', id: p.nodeId }, { name: 'observer', id: p.nodeId }];
  }
  if (p.mode === 'autopilot') return [{ name: 'home' }, { name: 'autopilot', scope: p.nodeId, startId: p.nodeId }];
  return [{ name: 'home' }, { name: 'node', id: p.nodeId }];
}

let handled: string | null = null;
function handle(r: Notifications.NotificationResponse | null) {
  if (!r || handled === r.notification.request.identifier) return;
  handled = r.notification.request.identifier;
  const data = r.notification.request.content.data as Partial<Payload> | undefined;
  if (!data?.nodeId || !data.mode) return;
  nav().reset(routeFor(data as Payload));
}

/** Cold-start + warm taps. Called once at boot, before first paint. */
export function installNotificationRouting(): () => void {
  handle(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
