import * as Notifications from 'expo-notifications';
import type { CortexNode, NodeId } from '../engine/types';
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

/**
 * OS alarms cancelled while their node still remembers them (delete, "remove
 * reminder"). Undo restores the node with that dead id; `reviveReminders` rings it again.
 */
const cancelled = new Set<string>();

function scheduleReminder(id: NodeId, at: number, hook: string | null): Promise<string | null> {
  const e = getEngine();
  const n = e.get(id)!;
  const title = hook ? `▶ ${hook}` : n.title || 'Sofia Cortex';
  const body = hook ? `Otopilot hazır · ${n.title}` : e.path(id).slice(0, -1).map((p) => p.title).join(' › ') || 'Hatırlatma';
  return schedule(at, title, body, { nodeId: id, mode: hook ? 'autopilot' : 'node' });
}

/** 'past': the time has gone by, the current reminder stays as it was. 'denied': no notification permission. */
export async function setReminder(id: NodeId, at: number | null, hook: string | null): Promise<'ok' | 'past' | 'denied'> {
  const e = getEngine();
  const n = e.get(id);
  if (!n) return 'ok';
  if (at != null && at <= Date.now()) return 'past';
  if (n.reminderId) await Notifications.cancelScheduledNotificationAsync(n.reminderId).catch(() => {});
  if (at == null) {
    if (n.reminderId) cancelled.add(n.reminderId);
    e.update(id, { reminderAt: null, reminderHook: null, reminderId: null });
    return 'ok';
  }
  const rid = await scheduleReminder(id, at, hook);
  // Without permission nothing will ring — the note must not claim a reminder.
  if (!rid) {
    e.update(id, { reminderAt: null, reminderHook: null, reminderId: null });
    return 'denied';
  }
  e.update(id, { reminderAt: at, reminderHook: hook, reminderId: rid });
  return 'ok';
}

/** After undo: a live node carrying a cancelled alarm id gets a fresh alarm (or drops a past one). */
export async function reviveReminders(ids: Iterable<NodeId>): Promise<void> {
  const e = getEngine();
  for (const id of ids) {
    const n = e.get(id);
    const old = n?.reminderId;
    if (!n || n.deletedAt != null || !old || !cancelled.has(old)) continue;
    cancelled.delete(old);
    const rid = n.reminderAt != null && n.reminderAt > Date.now() ? await scheduleReminder(id, n.reminderAt, n.reminderHook) : null;
    // Deleted or changed again while scheduling — the new alarm must not outlive that.
    if (e.get(id)?.reminderId !== old) {
      if (rid) Notifications.cancelScheduledNotificationAsync(rid).catch(() => {});
      continue;
    }
    e.update(id, rid ? { reminderId: rid } : { reminderAt: null, reminderHook: null, reminderId: null }, { history: false });
  }
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
export function cancelTriggers(nodes: CortexNode[]): void {
  for (const n of nodes) {
    if (n.reminderId) {
      cancelled.add(n.reminderId);
      Notifications.cancelScheduledNotificationAsync(n.reminderId).catch(() => {});
    }
    cancelSteep(n.id);
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

/** Cold-start + warm taps, and alarms brought back by undo. Called once at boot, before first paint. */
export function installNotificationRouting(): () => void {
  handle(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  const off = getEngine().subscribeAll((changed) => void reviveReminders(changed));
  return () => {
    sub.remove();
    off();
  };
}
